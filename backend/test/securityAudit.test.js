import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { readSecurityConfig, securityLoggerOptions } from '../src/plugins/security.js'
import { createAuthService } from '../src/services/authService.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import { validatePassword } from '../src/utils/authValidation.js'
import { testDatabaseUrl } from './helpers/testDatabase.js'
import { createFakePrisma, createEquipamentoRecord } from './helpers/fakePrisma.js'

async function fixture(context, options = {}) {
  const received = []
  const user = { id: 1, username: 'audit.fixture', role: 'ADMIN', ativo: true }
  const app = buildApp({ securityConfig: readSecurityConfig({ NODE_ENV: 'test' }),
    authService: { resolveSession: async () => user,
      login: async (data) => { received.push(data); return { user, token: 'fixture-token', expiresAt: new Date('2030-01-01') } } },
    usuarioService: {
      createViewer: async (data) => { received.push(data); return user },
      resetPassword: async (_id, password) => { received.push(password); return user },
      setStatus: async (_id, ativo) => { received.push(ativo); return user },
    }, ...options })
  context.after(() => app.close())
  const csrf = await app.inject('/auth/csrf')
  const headers = { origin: 'http://localhost:5173', cookie: csrf.headers['set-cookie'].split(';')[0],
    'x-csrf-token': csrf.json().csrfToken }
  return { app, headers, received }
}

test('auditoria: todos os validadores de senha rejeitam somente espaços sem normalizar', () => {
  for (const password of ['        ', '\t'.repeat(8), '\u00a0'.repeat(8)]) {
    assert.throws(() => validatePassword(password), { code: 'SENHA_INVALIDA' })
  }
  assert.equal(validatePassword(' Senha fixture! '), ' Senha fixture! ')
})

test('auditoria: tentativas simultâneas reservam o limite de login antes do acesso ao banco', async () => {
  let reads = 0
  let release
  const barrier = new Promise((resolve) => { release = resolve })
  const service = createAuthService({ prisma: { usuario: { findUnique: async () => {
    reads += 1
    await barrier
    return null
  } } } })
  const requests = Array.from({ length: 6 }, () => service.login({
    username: 'audit.fixture', password: 'Senha ficticia errada!', ip: '127.0.0.1',
  }).catch((error) => error.statusCode))
  release()
  const statuses = await Promise.all(requests)
  assert.equal(reads, 5)
  assert.deepEqual(statuses.sort(), [401, 401, 401, 401, 401, 429])
})

test('auditoria: autenticação e usuários rejeitam tipos incorretos antes do serviço', async (context) => {
  const { app, headers, received } = await fixture(context)
  for (const value of [12345678, true, null, ['abcdefgh'], { value: 'abcdefgh' }]) {
    for (const [method, url, payload] of [
      ['POST', '/auth/login', { username: 'audit.fixture', password: value }],
      ['POST', '/usuarios', { username: 'audit.fixture', password: value }],
      ['PATCH', '/usuarios/2/senha', { password: value }],
    ]) assert.equal((await app.inject({ method, url, headers, payload })).statusCode, 400)
  }
  for (const ativo of ['false', 0, ['true']]) {
    assert.equal((await app.inject({ method: 'PATCH', url: '/usuarios/2/status', headers, payload: { ativo } })).statusCode, 400)
  }
  assert.deepEqual(received, [])
})

test('auditoria: URLs, erros e logs não refletem marcadores sensíveis', async (context) => {
  const lines = []
  const { app, headers } = await fixture(context, {
    logger: { ...securityLoggerOptions(), stream: { write: (line) => lines.push(line) } },
  })
  const marker = 'AUDIT_SYNTHETIC_SECRET'
  for (const url of [`/unknown/${marker}?password=${marker}`, `/health?password=${marker}`,
    `/unknown/${marker}/%zz`, `/auth/${marker}/%`]) {
    const response = await app.inject({ url, headers: { authorization: marker, cookie: marker } })
    assert.equal(response.body.includes(marker), false)
  }
  const missing = await app.inject(`/unknown/${marker}`)
  assert.deepEqual(missing.json(), { error: 'ROTA_NAO_ENCONTRADA', message: 'Rota não encontrada.', details: [] })
  const unsupported = await app.inject({ method: 'POST', url: '/auth/login',
    headers: { ...headers, 'content-type': 'application/xml' }, payload: '<fixture />' })
  assert.equal(unsupported.statusCode, 415)
  assert.deepEqual(unsupported.json(), { error: 'TIPO_CONTEUDO_NAO_SUPORTADO', message: 'Tipo de conteúdo não suportado.', details: [] })
  assert.equal(lines.join('').includes(marker), false)
})

test('auditoria: configuração rejeita duração parcial e segredo de produção em branco', () => {
  for (const value of ['8.5', '8garbage', '8e2', '0', '169']) {
    assert.throws(() => readSecurityConfig({ SESSION_DURATION_HOURS: value }), /SESSION_DURATION_HOURS/)
  }
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://example.test',
    CSRF_SECRET: ' '.repeat(64) }), /CSRF_SECRET/)
})

test('auditoria: integração recusa banco operacional, remoto, produção ou variável ausente', () => {
  for (const env of [{}, { DATABASE_URL: 'mysql://fixture:fixture@127.0.0.1/ZebraOneCare' },
    { TEST_DATABASE_URL: 'mysql://fixture:fixture@127.0.0.1/ZebraOneCare' },
    { TEST_DATABASE_URL: 'mysql://fixture:fixture@external.test/ZebraOneCareTest' },
    { TEST_DATABASE_URL: 'mysql://fixture:fixture@127.0.0.1/ZebraOneCareTest', NODE_ENV: 'production' },
    { TEST_DATABASE_URL: 'invalid' }]) assert.throws(() => testDatabaseUrl(env))
  assert.equal(new URL(testDatabaseUrl({ TEST_DATABASE_URL: 'mysql://fixture:fixture@127.0.0.1/ZebraOneCareTest' })).pathname, '/ZebraOneCareTest')
})

const equipment = { serialNumber: 'AUDITNEW', partNumber: 'FIXTURE', cliente: 'FIXTURE',
  distribuidor: 'FIXTURE', dataInicioOnecare: '2026-01-01', dataFimOnecare: '2026-12-31' }
const routes = [
  ['GET', '/auth/me', 'READ', 200],
  ['GET', '/equipamentos', 'READ', 200],
  ['GET', '/equipamentos/arquivados', 'READ', 200],
  ['GET', '/equipamentos/1', 'READ', 200],
  ['GET', '/equipamentos/1/historico-contratos', 'READ', 200],
  ['GET', '/dashboard/resumo', 'READ', 200],
  ['GET', '/usuarios', 'ADMIN', 200],
  ['POST', '/usuarios', 'ADMIN', 201, { username: 'audit.viewer', password: 'Senha fixture!' }],
  ['PATCH', '/usuarios/2/status', 'ADMIN', 200, { ativo: false }],
  ['PATCH', '/usuarios/2/senha', 'ADMIN', 200, { password: 'Senha fixture!' }],
  ['POST', '/equipamentos', 'ADMIN', 201, equipment],
  ['PATCH', '/equipamentos/1', 'ADMIN', 200, { contratoOnecare: 'CONTRACT FIXTURE' }],
  ['DELETE', '/equipamentos/1', 'ADMIN', 200],
  ['PATCH', '/equipamentos/1/restaurar', 'ADMIN', 200],
  ['POST', '/equipamentos/importacao/validar', 'ADMIN', 415],
  ['POST', '/equipamentos/importacao/confirmar', 'ADMIN', 415],
  ['GET', '/notificacoes', 'ADMIN', 200],
  ['GET', '/notificacoes/nao-lidas/contagem', 'ADMIN', 200],
  ['PATCH', '/notificacoes/1/ler', 'ADMIN', 200],
  ['PATCH', '/notificacoes/ler-todas', 'ADMIN', 200],
  ['PATCH', '/auth/senha', 'ADMIN', 204, { senhaAtual: 'Senha fixture!', novaSenha: 'Nova fixture!', confirmacaoNovaSenha: 'Nova fixture!' }],
]

for (const role of ['ANONYMOUS', 'INACTIVE', 'VISUALIZADOR', 'ADMIN']) {
  test(`auditoria: matriz de 21 rotas para ${role}`, async (context) => {
    const { prisma } = createFakePrisma([createEquipamentoRecord()])
    const user = { id: 1, username: 'audit.fixture', role, ativo: role !== 'INACTIVE' }
    const { app } = await fixture(context, {
      authService: { resolveSession: async (token) => token === 'session-fixture' &&
        !['ANONYMOUS', 'INACTIVE'].includes(role) ? user : null, changeOwnPassword: async () => {} },
      usuarioService: { list: async () => ({ data: [] }), createViewer: async () => user,
        setStatus: async () => user, resetPassword: async () => user },
      equipamentoService: createEquipamentoService({ prisma }),
      dashboardService: { summary: async () => ({ totals: {}, proximosVencimentos: [], vencidosRecentes: [] }) },
      importacaoService: {},
      notificacaoService: { list: async () => ({ data: [] }), unreadCount: async () => 0,
        markRead: async () => ({ id: 1, lida: true }), markAllRead: async () => 0 },
    })
    const cookie = 'onecare_session=session-fixture'
    const csrf = await app.inject({ url: '/auth/csrf', headers: { cookie } })
    const headers = { origin: 'http://localhost:5173',
      cookie: `${cookie}; ${csrf.headers['set-cookie'].split(';')[0]}`,
      'x-csrf-token': csrf.json().csrfToken }
    for (const [method, url, access, status, payload] of routes) {
      const expected = ['ANONYMOUS', 'INACTIVE'].includes(role) ? 401
        : role === 'VISUALIZADOR' && access === 'ADMIN' ? 403 : status
      const result = await app.inject({ method, url, headers, payload })
      assert.equal(result.statusCode, expected, `${role}: ${method} ${url}`)
    }
  })
}

test('auditoria: identificadores, tipos, mass assignment e JSON adversarial são recusados', async (context) => {
  const { prisma } = createFakePrisma([createEquipamentoRecord()])
  const { app, headers, received } = await fixture(context, { equipamentoService: createEquipamentoService({ prisma }) })
  for (const id of ['-1', '1.5', '0', '999999999999999999999', encodeURIComponent("1 OR 1=1")]) {
    assert.equal((await app.inject(`/equipamentos/${id}`)).statusCode,
      id === '999999999999999999999' ? 422 : 400)
  }
  assert.equal((await app.inject('/equipamentos/999')).statusCode, 404)
  for (const query of ['limit=101', 'page=-1', 'page=1&page=2', 'sortBy=__proto__', 'order=asc%3BDROP', 'role=ADMIN']) {
    assert.equal((await app.inject(`/equipamentos?${query}`)).statusCode, 400)
  }
  for (const extra of [{ role: 'ADMIN' }, { adminSlot: 1 }, { senhaHash: 'fixture' }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/usuarios', headers,
      payload: { username: 'audit.viewer', password: 'Senha fixture!', ...extra } })).statusCode, 400)
  }
  assert.equal(received.length, 0)
  for (const extra of [{ arquivado: true }, { statusOnecare: 'ATIVO' }, { cliente: {} }, { serialNumber: ['12345678'] }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/equipamentos', headers,
      payload: { ...equipment, ...extra } })).statusCode, 400)
  }
  for (const payload of ['{"__proto__":{"auditPolluted":true}}', '{bad-json', JSON.stringify({ cliente: { nested: { value: 'fixture' } } })]) {
    assert.equal((await app.inject({ method: 'PATCH', url: '/equipamentos/1',
      headers: { ...headers, 'content-type': 'application/json' }, payload })).statusCode, 400)
  }
  assert.equal({}.auditPolluted, undefined)
  const query = encodeURIComponent("' OR 1=1; --")
  const search = await app.inject(`/equipamentos?q=${query}`)
  assert.equal(search.statusCode, 200)
  assert.deepEqual(search.json().data, [])
})
