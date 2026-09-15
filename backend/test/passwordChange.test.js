import assert from 'node:assert/strict'
import test from 'node:test'
import { Writable } from 'node:stream'
import argon2 from 'argon2'

import { buildApp } from '../src/app.js'
import { securityLoggerOptions } from '../src/plugins/security.js'
import { ARGON2_OPTIONS, createAuthService, hashSessionToken } from '../src/services/authService.js'
import { validatePasswordChange } from '../src/utils/passwordChangeValidation.js'
import { changedPassword, fakeAuthPrisma, httpLogin, originalPassword, passwordPayload } from './helpers/authFixture.js'

const initialHash = await argon2.hash(originalPassword, ARGON2_OPTIONS)
const config = { allowedOrigins: new Set(['http://localhost:5173']), cookieSecure: false,
  csrfSecret: 'segredo-ficticio-de-teste-'.repeat(3) }

async function fixture(context, { logger = false } = {}) {
  const prisma = fakeAuthPrisma(initialHash)
  const service = createAuthService({ prisma })
  const app = buildApp({ authService: service, usuarioService: {}, securityConfig: config, logger })
  context.after(() => app.close())
  const login = await httpLogin(app, 'admin.fixture', originalPassword)
  assert.equal(login.response.statusCode, 200)
  return { prisma, service, app, login }
}

test('troca própria salva Argon2id, revoga todas as sessões e exige novo login e CSRF', async (context) => {
  const { prisma, app, login } = await fixture(context)
  const other = await httpLogin(app, 'admin.fixture', originalPassword)
  // Uma sessão de outro usuário não deve ser revogada.
  prisma.state.sessions.push({ usuarioId: 2, tokenHash: 'outro-usuario', expiresAt: new Date(Date.now() + 60000) })
  const result = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload: passwordPayload() })
  assert.equal(result.statusCode, 204)
  assert.equal(result.body, '')
  const cookies = result.headers['set-cookie']
  for (const name of ['onecare_session', 'onecare_csrf']) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`))
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    assert.match(cookie, /Path=\//)
  }
  const hash = prisma.state.users[0].senhaHash
  assert.equal(hash.startsWith('$argon2id$'), true)
  assert.equal(hash.includes(changedPassword), false)
  assert.equal(await argon2.verify(hash, changedPassword), true)
  assert.equal(await argon2.verify(hash, changedPassword.trim()), false)
  assert.equal(await argon2.verify(hash, originalPassword), false)
  assert.equal(prisma.state.sessions.length, 1)
  assert.equal(prisma.state.sessions[0].usuarioId, 2)
  for (const session of [login, other]) {
    assert.equal((await app.inject({ url: '/auth/me', headers: session.headers })).statusCode, 401)
    assert.equal((await app.inject({ method: 'PATCH', url: '/auth/senha', headers: session.headers, payload: passwordPayload() })).statusCode, 401)
  }
  assert.equal((await httpLogin(app, 'admin.fixture', originalPassword)).response.statusCode, 401)
  const fresh = await httpLogin(app, 'admin.fixture', changedPassword)
  assert.equal(fresh.response.statusCode, 200)
  assert.equal(fresh.token === login.token || fresh.token === other.token, false)
  assert.equal((await app.inject({ url: '/auth/me', headers: fresh.headers })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: {
    ...fresh.headers, 'x-csrf-token': login.headers['x-csrf-token'],
  } })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: fresh.headers })).statusCode, 200)
  assert.equal((await app.inject('/health')).statusCode, 200)
})

for (const [label, payload] of [
  ['confirmação diferente', { ...passwordPayload(), confirmacaoNovaSenha: 'outra senha' }],
  ['nova igual à atual', { senhaAtual: originalPassword, novaSenha: originalPassword, confirmacaoNovaSenha: originalPassword }],
  ['abaixo do mínimo', { ...passwordPayload(), novaSenha: 'x'.repeat(7), confirmacaoNovaSenha: 'x'.repeat(7) }],
  ['acima do máximo', { ...passwordPayload(), novaSenha: 'x'.repeat(129) }],
  ['objeto ausente', undefined], ['objeto nulo', null], ['array', []], ['string', 'invalido'],
  ['campo inesperado', { ...passwordPayload(), id: 2 }],
  ...['senhaAtual', 'novaSenha', 'confirmacaoNovaSenha'].flatMap((field) => [
    [`${field} ausente`, Object.fromEntries(Object.entries(passwordPayload()).filter(([key]) => key !== field))],
    ...[12345678, true, null, [], {}, '', '        '].map((value, index) =>
      [`${field} tipo/vazio ${index}`, { ...passwordPayload(), [field]: value }]),
  ]),
]) {
  test(`validação da troca rejeita ${label} sem ecoar valores`, () => {
    assert.throws(() => validatePasswordChange(payload), (error) =>
      error.statusCode === 400 && !error.message.includes(originalPassword) && !error.message.includes(changedPassword))
  })
}

test('validação aceita os limites de 8 e 128 e preserva espaços e caixa', () => {
  for (const novaSenha of ['Abcd1234', 'X'.repeat(128), changedPassword]) {
    assert.equal(validatePasswordChange({ senhaAtual: originalPassword, novaSenha, confirmacaoNovaSenha: novaSenha }).novaSenha, novaSenha)
  }
})

test('senha incorreta e falhas de validação preservam hash, sessões e cookies', async (context) => {
  const { app, prisma, login } = await fixture(context)
  const before = structuredClone(prisma.state)
  for (const payload of [{ ...passwordPayload(), senhaAtual: 'Senha ficticia errada!' },
    { ...passwordPayload(), confirmacaoNovaSenha: 'Diferente!' },
    { ...passwordPayload(), novaSenha: 12345678 }, {}]) {
    const result = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload })
    assert.equal(result.statusCode, 400)
    assert.equal(result.headers['set-cookie'], undefined)
    assert.equal(JSON.stringify(prisma.state) === JSON.stringify(before), true)
    assert.equal((await app.inject({ url: '/auth/me', headers: login.headers })).statusCode, 200)
  }
})

test('rota recusa sessão ausente, expirada, visualizador e conta inativa', async (context) => {
  const { app, prisma, login } = await fixture(context)
  const send = (headers = login.headers) => app.inject({ method: 'PATCH', url: '/auth/senha', headers, payload: passwordPayload() })
  assert.equal((await send({})).statusCode, 401)
  prisma.state.users[0].role = 'VISUALIZADOR'
  assert.equal((await send()).statusCode, 403)
  prisma.state.users[0].role = 'ADMIN'
  prisma.state.users[0].ativo = false
  assert.equal((await send()).statusCode, 401)
  prisma.state.users[0].ativo = true
  const expired = await httpLogin(app, 'admin.fixture', originalPassword)
  prisma.state.sessions[0].expiresAt = new Date(0)
  assert.equal((await send(expired.headers)).statusCode, 401)
})

test('CSRF ausente/inválido e origem não permitida impedem troca', async (context) => {
  const { app, prisma, login } = await fixture(context)
  for (const overrides of [{ 'x-csrf-token': undefined }, { 'x-csrf-token': 'invalido' },
    { origin: 'http://malicioso.test' }, { origin: undefined }]) {
    const headers = Object.fromEntries(Object.entries({ ...login.headers, ...overrides }).filter(([, value]) => value !== undefined))
    assert.equal((await app.inject({ method: 'PATCH', url: '/auth/senha', headers, payload: passwordPayload() })).statusCode, 403)
  }
  assert.equal(prisma.state.users[0].senhaHash === initialHash, true)
  assert.equal(prisma.state.sessions.length, 1)
})

test('troca tem limite de cinco requisições por administrador com Retry-After', async (context) => {
  const { app, login, prisma } = await fixture(context)
  for (let index = 0; index < 5; index++) {
    assert.equal((await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload: {} })).statusCode, 400)
  }
  const limited = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload: passwordPayload() })
  assert.equal(limited.statusCode, 429)
  assert.ok(Number(limited.headers['retry-after']) > 0)
  assert.equal(prisma.state.sessions.length, 1)
})

test('falha na revogação faz rollback da troca de senha e mantém sessão', async (context) => {
  const { prisma, app, login } = await fixture(context)
  prisma.failDeletion = true
  const result = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload: passwordPayload() })
  assert.equal(result.statusCode, 500)
  assert.equal(result.json().error, 'ERRO_INTERNO')
  assert.equal(result.headers['set-cookie'], undefined)
  assert.equal(prisma.state.users[0].senhaHash === initialHash, true)
  assert.equal(prisma.state.sessions.length, 1)
})

test('troca concorrente ou sessão revogada durante Argon2 não sobrescreve a senha', async (context) => {
  const { prisma, service, login } = await fixture(context)
  prisma.beforeTransaction = () => { prisma.state.sessions = [] }
  await assert.rejects(service.changeOwnPassword(1, login.token, passwordPayload()),
    (error) => error.code === 'ALTERACAO_SENHA_NAO_CONCLUIDA')
  assert.equal(prisma.state.users[0].senhaHash === initialHash, true)
})

test('login iniciado com hash antigo não emite sessão após troca concorrente', async (context) => {
  const { prisma, service } = await fixture(context)
  const newHash = await argon2.hash(changedPassword, ARGON2_OPTIONS)
  prisma.beforeTransaction = () => { prisma.state.users[0].senhaHash = newHash; prisma.state.sessions = [] }
  await assert.rejects(service.login({ username: 'admin.fixture', password: originalPassword, ip: 'local' }),
    (error) => error.code === 'CREDENCIAIS_INVALIDAS')
  assert.equal(prisma.state.sessions.length, 0)
})

test('logs e erros não expõem senhas, hashes, cookies ou CSRF; query e excesso são recusados', async (context) => {
  let output = ''
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done() } })
  const { app, prisma, login } = await fixture(context, { logger: { ...securityLoggerOptions(), stream } })
  const query = await app.inject({ method: 'PATCH', url: '/auth/senha?novaSenha=segredo-ficticio-query',
    headers: login.headers, payload: passwordPayload() })
  assert.equal(query.statusCode, 400)
  const large = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers,
    payload: { ...passwordPayload(), novaSenha: 'x'.repeat(70 * 1024) } })
  assert.equal(large.statusCode, 413)
  prisma.failDeletion = true
  const failure = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: login.headers, payload: passwordPayload() })
  assert.equal(failure.statusCode, 500)
  app.log.info({ req: { method: 'PATCH', url: '/auth/senha', body: passwordPayload() },
    ...passwordPayload(), senhaHash: initialHash, token: login.token }, 'Teste de redação')
  for (const secret of [originalPassword, changedPassword, initialHash, login.token,
    hashSessionToken(login.token), login.headers['x-csrf-token'], 'segredo-ficticio-query']) {
    assert.equal(output.includes(secret), false)
    assert.equal(failure.body.includes(secret), false)
    assert.equal(query.body.includes(secret), false)
  }
})
