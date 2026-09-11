import assert from 'node:assert/strict'
import test from 'node:test'

import argon2 from 'argon2'

import { buildApp } from '../src/app.js'
import { createAuthService, hashSessionToken } from '../src/services/authService.js'
import { createUsuarioService } from '../src/services/usuarioService.js'
import { validatePassword, validateUsername } from '../src/utils/authValidation.js'

const now = new Date('2026-09-11T12:00:00Z')

test('valida formato do usuário e limites da senha sem normalizar a senha', () => {
  assert.equal(validateUsername(' Nome.Valido-_1 '), 'nome.valido-_1')
  for (const value of ['ab', 'nome com espaço', 'nome@dominio']) {
    assert.throws(() => validateUsername(value), (error) => error.code === 'USERNAME_INVALIDO')
  }
  assert.equal(validatePassword('   senha com espaços   '), '   senha com espaços   ')
  assert.throws(() => validatePassword('curta'), (error) => error.code === 'SENHA_INVALIDA')
})

test('login normaliza usuário, usa Argon2id e persiste somente hash do token', async () => {
  const senhaHash = await argon2.hash('senha muito segura!', { type: argon2.argon2id })
  let sessionData
  const user = { id: 1, username: 'admin.teste', senhaHash, role: 'ADMIN', ativo: true,
    ultimoLoginEm: null, createdAt: now, updatedAt: now }
  const prisma = {
    usuario: { findUnique: async ({ where }) => where.username === user.username ? user : null },
    $transaction: async (operation) => operation({
      sessao: { create: async ({ data }) => { sessionData = data } },
      usuario: { update: async () => user },
    }),
  }
  const result = await createAuthService({ prisma, clock: () => now }).login({
    username: ' ADMIN.TESTE ', password: 'senha muito segura!', ip: '127.0.0.1',
  })
  assert.equal(result.user.username, 'admin.teste')
  assert.equal(sessionData.tokenHash, hashSessionToken(result.token))
  assert.notEqual(sessionData.tokenHash, result.token)
  assert.equal(sessionData.expiresAt.toISOString(), '2026-09-11T20:00:00.000Z')
})

test('login não revela se usuário não existe, está inativo ou a senha está incorreta', async () => {
  const senhaHash = await argon2.hash('senha muito segura!')
  for (const user of [null, { id: 2, username: 'viewer', senhaHash, ativo: false },
    { id: 3, username: 'viewer', senhaHash, ativo: true }]) {
    const service = createAuthService({ prisma: { usuario: { findUnique: async () => user } } })
    await assert.rejects(service.login({ username: 'viewer', password: 'senha incorreta', ip: '1' }),
      (error) => error.code === 'CREDENCIAIS_INVALIDAS' && error.statusCode === 401)
  }
})

test('limite de login bloqueia após cinco falhas na janela', async () => {
  const service = createAuthService({ prisma: { usuario: { findUnique: async () => null } }, clock: () => now })
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(service.login({ username: 'viewer', password: 'qualquer senha', ip: '10.0.0.1' }),
      (error) => error.code === 'CREDENCIAIS_INVALIDAS')
  }
  await assert.rejects(service.login({ username: 'viewer', password: 'qualquer senha', ip: '10.0.0.1' }),
    (error) => error.code === 'LIMITE_LOGIN' && error.statusCode === 429)
})

test('sessão expirada ou de usuário inativo é recusada e removida', async () => {
  for (const session of [
    { expiresAt: new Date('2026-09-11T11:59:59Z'), usuario: { ativo: true } },
    { expiresAt: new Date('2026-09-11T13:00:00Z'), usuario: { ativo: false } },
  ]) {
    let removed = false
    const service = createAuthService({ prisma: {
      sessao: { findUnique: async () => session, deleteMany: async () => { removed = true } },
    }, clock: () => now })
    assert.equal(await service.resolveSession('token'), null)
    assert.equal(removed, true)
  }
})

test('desativar visualizador e redefinir senha revogam todas as sessões', async () => {
  const deleted = []
  const viewer = { id: 8, username: 'viewer', role: 'VISUALIZADOR', ativo: true, createdAt: now, updatedAt: now }
  const tx = {
    usuario: { update: async ({ data }) => ({ ...viewer, ...data }) },
    sessao: { deleteMany: async ({ where }) => deleted.push(where.usuarioId) },
  }
  const service = createUsuarioService({ prisma: {
    usuario: { findUnique: async () => viewer }, $transaction: async (operation) => operation(tx),
  } })
  await service.setStatus(8, false)
  await service.resetPassword(8, 'uma senha nova segura')
  assert.deepEqual(deleted, [8, 8])
})

test('cadastro pela API de usuários força VISUALIZADOR, normaliza o nome e usa hash', async () => {
  let data
  const service = createUsuarioService({ prisma: { usuario: { create: async (args) => {
    data = args.data
    return { id: 5, ...args.data, ativo: true, ultimoLoginEm: null, createdAt: now, updatedAt: now }
  } } } })
  const result = await service.createViewer({ username: ' Consulta.Um ', password: 'senha individual segura' })
  assert.equal(result.role, 'VISUALIZADOR')
  assert.equal(data.username, 'consulta.um')
  assert.equal(data.adminSlot, null)
  assert.equal(await argon2.verify(data.senhaHash, 'senha individual segura'), true)
  assert.equal('senhaHash' in result, false)
})

test('administrador não pode ser desativado nem alterado pelas rotas de usuários', async () => {
  const service = createUsuarioService({ prisma: { usuario: { findUnique: async () => ({ id: 1, role: 'ADMIN' }) } } })
  await assert.rejects(service.setStatus(1, false), (error) => error.code === 'OPERACAO_NAO_PERMITIDA')
  await assert.rejects(service.resetPassword(1, 'uma senha nova segura'), (error) => error.code === 'OPERACAO_NAO_PERMITIDA')
})

test('API exige autenticação e separa leitura de operações administrativas', async (context) => {
  const authService = {
    resolveSession: async (token) => token === 'admin' ? { id: 1, role: 'ADMIN' }
      : token === 'viewer' ? { id: 2, role: 'VISUALIZADOR' } : null,
    login: async () => ({ token: 'admin', expiresAt: new Date(Date.now() + 3600000), user: { id: 1, role: 'ADMIN' } }),
    logout: async () => {},
  }
  const equipamentoService = {
    list: async () => ({ equipamentos: [], page: 1, limit: 20, total: 0, totalPages: 0, sortBy: 'createdAt', order: 'desc' }),
    create: async () => ({ id: 1 }),
  }
  const app = buildApp({ authService, usuarioService: { list: async () => ({ data: [] }) }, equipamentoService,
    securityConfig: { allowedOrigins: new Set(['http://localhost:5173']), cookieSecure: false, csrfSecret: 'x'.repeat(64) } })
  context.after(() => app.close())

  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/equipamentos' })).statusCode, 401)
  assert.equal((await app.inject({ method: 'GET', url: '/equipamentos', headers: { cookie: 'onecare_session=viewer' } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/equipamentos', headers: { cookie: 'onecare_session=viewer' }, payload: {} })).statusCode, 403)
})

test('login exige origem e CSRF, entrega cookie HttpOnly e nunca retorna o token de sessão', async (context) => {
  const authService = {
    resolveSession: async () => null,
    login: async () => ({ token: 'token-opaco-secreto', expiresAt: new Date('2026-09-11T20:00:00Z'), user: { id: 1, username: 'admin', role: 'ADMIN', ativo: true } }),
    logout: async () => {},
  }
  const config = { allowedOrigins: new Set(['http://localhost:5173']), cookieSecure: false, csrfSecret: 'y'.repeat(64) }
  const app = buildApp({ authService, usuarioService: {}, securityConfig: config })
  context.after(() => app.close())
  const csrf = await app.inject({ method: 'GET', url: '/auth/csrf' })
  const csrfCookie = csrf.headers['set-cookie'].split(';')[0]
  const csrfToken = csrf.json().csrfToken

  const withoutCsrf = await app.inject({ method: 'POST', url: '/auth/login', headers: { origin: 'http://localhost:5173' }, payload: { username: 'admin', password: 'senha' } })
  assert.equal(withoutCsrf.statusCode, 403)
  assert.equal(withoutCsrf.json().error, 'CSRF_INVALIDO')

  const login = await app.inject({ method: 'POST', url: '/auth/login', headers: {
    origin: 'http://localhost:5173', cookie: csrfCookie, 'x-csrf-token': csrfToken,
  }, payload: { username: 'admin', password: 'senha' } })
  assert.equal(login.statusCode, 200)
  assert.equal(JSON.stringify(login.json()).includes('token-opaco-secreto'), false)
  const cookies = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [login.headers['set-cookie']]
  const sessionCookie = cookies.find((value) => value.startsWith('onecare_session='))
  assert.match(sessionCookie, /HttpOnly/i)
  assert.match(sessionCookie, /SameSite=Strict/i)
  assert.match(sessionCookie, /Path=\//)
})

test('configuração recusa cookie inseguro e segredo ausente em produção', async () => {
  const { readSecurityConfig } = await import('../src/plugins/security.js')
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false', CSRF_SECRET: 'z'.repeat(64) }), /COOKIE_SECURE/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true' }), /FRONTEND_ORIGIN/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true', FRONTEND_ORIGIN: 'https://onecare.example' }), /CSRF_SECRET/)
})
