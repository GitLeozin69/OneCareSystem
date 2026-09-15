import assert from 'node:assert/strict'
import test from 'node:test'

import argon2 from 'argon2'

import { buildApp } from '../src/app.js'
import { ARGON2_OPTIONS, createAuthService, hashSessionToken } from '../src/services/authService.js'
import { createUsuarioService } from '../src/services/usuarioService.js'
import { validatePassword, validateUsername } from '../src/utils/authValidation.js'
import { readSecurityConfig, securityLoggerOptions } from '../src/plugins/security.js'

const now = new Date('2026-09-11T12:00:00Z')

test('valida formato do usuário e limites da senha sem normalizar a senha', () => {
  assert.equal(validateUsername(' Nome.Valido-_1 '), 'nome.valido-_1')
  for (const value of ['ab', 'nome com espaço', 'nome@dominio']) {
    assert.throws(() => validateUsername(value), (error) => error.code === 'USERNAME_INVALIDO')
  }
  assert.equal(validatePassword('12345678'), '12345678')
  assert.equal(validatePassword('   senha com espaços   '), '   senha com espaços   ')
  assert.throws(() => validatePassword('1234567'), (error) => error.code === 'SENHA_INVALIDA')
})

test('login normaliza usuário, usa Argon2id e persiste somente hash do token', async () => {
  const senhaHash = await argon2.hash('senha muito segura!', { type: argon2.argon2id })
  let sessionData
  const user = { id: 1, username: 'admin.teste', senhaHash, role: 'ADMIN', ativo: true,
    ultimoLoginEm: null, createdAt: now, updatedAt: now }
  const prisma = {
    usuario: { findUnique: async ({ where }) => where.username === user.username ? user : null },
    $transaction: async (operation) => operation({
      sessao: { deleteMany: async () => {}, create: async ({ data }) => { sessionData = data } },
      usuario: { updateMany: async () => ({ count: 1 }) },
    }),
  }
  const result = await createAuthService({ prisma, clock: () => now }).login({
    username: ' ADMIN.TESTE ', password: 'senha muito segura!', ip: '127.0.0.1',
  })
  assert.equal(result.user.username, 'admin.teste')
  assert.equal(sessionData.tokenHash, hashSessionToken(result.token))
  assert.notEqual(sessionData.tokenHash, result.token)
  assert.equal(sessionData.expiresAt.toISOString(), '2026-09-11T20:00:00.000Z')
  assert.match(senhaHash, /\$argon2id\$v=19\$m=65536,p=4,t=3\$/)
  assert.deepEqual(ARGON2_OPTIONS, {
    type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4,
  })
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
    (error) => error.code === 'LIMITE_LOGIN' && error.statusCode === 429 &&
      error.retryAfterSeconds === 900)
})

test('login bem-sucedido remove sessões expiradas e revoga o token anterior', async () => {
  const senhaHash = await argon2.hash('senha segura', ARGON2_OPTIONS)
  let cleanupWhere
  const user = { id: 1, username: 'admin', senhaHash, role: 'ADMIN', ativo: true,
    ultimoLoginEm: null, createdAt: now, updatedAt: now }
  const prisma = {
    usuario: { findUnique: async () => user },
    $transaction: async (operation) => operation({
      sessao: {
        deleteMany: async ({ where }) => { cleanupWhere = where },
        create: async () => {},
      },
      usuario: { updateMany: async () => ({ count: 1 }) },
    }),
  }
  await createAuthService({ prisma, clock: () => now }).login({
    username: 'admin', password: 'senha segura', ip: '127.0.0.1', previousToken: 'antigo',
  })
  assert.equal(cleanupWhere.OR[0].expiresAt.lte, now)
  assert.equal(cleanupWhere.OR[1].tokenHash, hashSessionToken('antigo'))
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
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false', CSRF_SECRET: 'z'.repeat(64) }), /COOKIE_SECURE/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true' }), /FRONTEND_ORIGIN/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true', FRONTEND_ORIGIN: 'https://onecare.example' }), /CSRF_SECRET/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'staging' }), /NODE_ENV/)
  assert.throws(() => readSecurityConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true',
    FRONTEND_ORIGIN: 'http://onecare.example', CSRF_SECRET: 'z'.repeat(64) }), /HTTPS/)
})

test('produção recusa rotas de negócio sem autenticação configurada', () => {
  assert.throws(() => buildApp({ runtimeEnv: 'production', equipamentoService: {} }),
    /Autenticação é obrigatória/)
})

test('configuração de logs cobre credenciais, cookies e tokens', () => {
  const paths = securityLoggerOptions().redact.paths
  for (const path of ['req.headers.authorization', 'req.headers.cookie',
    'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]', 'req.body.password',
    'DATABASE_URL', '*.databaseUrl', '*.token', '*.password', '*.senhaHash']) {
    assert.ok(paths.includes(path), path)
  }
})

function securityConfig(overrides = {}) {
  return {
    allowedOrigins: new Set(['http://localhost:5173']),
    cookieSecure: false,
    csrfSecret: 's'.repeat(64),
    production: false,
    ...overrides,
  }
}

function sessionCookie(response) {
  const cookies = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie'] : [response.headers['set-cookie']]
  return cookies.find((value) => value?.startsWith('onecare_session='))?.split(';')[0]
}

async function loginRequest(app) {
  const csrf = await app.inject('/auth/csrf')
  const csrfCookie = csrf.headers['set-cookie'].split(';')[0]
  const login = await app.inject({
    method: 'POST', url: '/auth/login', headers: {
      origin: 'http://localhost:5173', cookie: csrfCookie,
      'x-csrf-token': csrf.json().csrfToken,
    }, payload: { username: 'admin', password: 'senha segura' },
  })
  assert.equal(login.statusCode, 200)
  return { csrfCookie, login, cookie: `${csrfCookie}; ${sessionCookie(login)}` }
}

test('CSRF fica vinculado à sessão e logout revoga somente com token atual', async (context) => {
  let revoked
  const authService = {
    resolveSession: async (token) => token === 'sessao-nova'
      ? { id: 1, username: 'admin', role: 'ADMIN', ativo: true } : null,
    login: async () => ({ token: 'sessao-nova', expiresAt: new Date(Date.now() + 3600000),
      user: { id: 1, username: 'admin', role: 'ADMIN', ativo: true } }),
    logout: async (token) => { revoked = token },
  }
  const app = buildApp({ authService, usuarioService: {}, securityConfig: securityConfig() })
  context.after(() => app.close())
  const { csrfCookie, login, cookie } = await loginRequest(app)

  const stale = await app.inject({ method: 'POST', url: '/auth/logout', headers: {
    origin: 'http://localhost:5173', cookie, 'x-csrf-token':
      (await app.inject({ method: 'GET', url: '/auth/csrf', headers: { cookie: csrfCookie } })).json().csrfToken,
  } })
  assert.equal(stale.statusCode, 403)
  assert.equal(revoked, undefined)

  const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: {
    origin: 'http://localhost:5173', cookie, 'x-csrf-token': login.json().csrfToken,
  } })
  assert.equal(logout.statusCode, 200)
  assert.equal(revoked, 'sessao-nova')
  assert.match(logout.headers['set-cookie'], /onecare_session=;/)
})

test('CORS permite origem exata, rejeita origem parecida e limita preflight', async (context) => {
  const authService = { resolveSession: async () => null, login: async () => {}, logout: async () => {} }
  const app = buildApp({ authService, usuarioService: {}, securityConfig: securityConfig() })
  context.after(() => app.close())

  const allowed = await app.inject({ method: 'GET', url: '/health',
    headers: { origin: 'http://localhost:5173' } })
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173')
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true')

  const rejected = await app.inject({ method: 'GET', url: '/health',
    headers: { origin: 'http://localhost:5173.evil.test' } })
  assert.equal(rejected.headers['access-control-allow-origin'], undefined)
  assert.equal(rejected.headers['access-control-allow-credentials'], undefined)

  const preflight = await app.inject({ method: 'OPTIONS', url: '/equipamentos', headers: {
    origin: 'http://localhost:5173',
    'access-control-request-method': 'PATCH',
    'access-control-request-headers': 'x-csrf-token,content-type',
  } })
  assert.equal(preflight.statusCode, 204)
  assert.match(preflight.headers['access-control-allow-methods'], /PATCH/)
  assert.match(preflight.headers['access-control-allow-headers'], /X-CSRF-Token/i)
})

test('respostas recebem headers seguros, no-store e HSTS somente em produção', async (context) => {
  const authService = { resolveSession: async () => null, login: async () => {}, logout: async () => {} }
  const development = buildApp({ authService, usuarioService: {}, securityConfig: securityConfig() })
  const production = buildApp({ authService, usuarioService: {},
    securityConfig: securityConfig({ cookieSecure: true, production: true }) })
  context.after(async () => { await development.close(); await production.close() })
  const dev = await development.inject('/health')
  assert.match(dev.headers['content-security-policy'], /default-src 'self'/)
  assert.equal(dev.headers['x-content-type-options'], 'nosniff')
  assert.equal(dev.headers['x-frame-options'], 'DENY')
  assert.equal(dev.headers['referrer-policy'], 'no-referrer')
  assert.equal(dev.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
  assert.equal(dev.headers['cache-control'], 'no-store, max-age=0')
  assert.equal(dev.headers.pragma, 'no-cache')
  assert.equal(dev.headers['strict-transport-security'], undefined)
  assert.equal(dev.headers.server, undefined)
  assert.match((await production.inject('/health')).headers['strict-transport-security'],
    /max-age=31536000/)
})

test('cookie de sessão usa Secure em produção e não expõe token no JSON', async (context) => {
  const authService = {
    resolveSession: async () => null,
    login: async () => ({ token: 'segredo-da-sessao', expiresAt: new Date(Date.now() + 3600000),
      user: { id: 1, username: 'admin', role: 'ADMIN', ativo: true } }),
    logout: async () => {},
  }
  const app = buildApp({ authService, usuarioService: {},
    securityConfig: securityConfig({ cookieSecure: true, production: true }) })
  context.after(() => app.close())
  const { login } = await loginRequest(app)
  assert.match(sessionCookie(login), /^onecare_session=/)
  assert.match(login.headers['set-cookie'].toString(), /Secure/i)
  assert.doesNotMatch(login.body, /segredo-da-sessao/)
})

test('limite de força bruta retorna 429 e Retry-After pela API', async (context) => {
  const service = createAuthService({ prisma: { usuario: { findUnique: async () => null } },
    clock: () => now })
  const app = buildApp({ authService: service, usuarioService: {}, securityConfig: securityConfig() })
  context.after(() => app.close())
  const csrf = await app.inject('/auth/csrf')
  const headers = { origin: 'http://localhost:5173',
    cookie: csrf.headers['set-cookie'].split(';')[0], 'x-csrf-token': csrf.json().csrfToken }
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers,
      payload: { username: 'inexistente', password: 'senha errada' } })).statusCode, 401)
  }
  const limited = await app.inject({ method: 'POST', url: '/auth/login', headers,
    payload: { username: 'inexistente', password: 'senha errada' } })
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.headers['retry-after'], '900')
  assert.equal(limited.json().error, 'LIMITE_LOGIN')
})

test('visualizador pode consultar e é negado em todos os grupos mutáveis', async (context) => {
  const authService = {
    resolveSession: async (token) => token === 'viewer'
      ? { id: 2, username: 'viewer', role: 'VISUALIZADOR', ativo: true } : null,
    login: async () => {}, logout: async () => {},
  }
  const app = buildApp({
    authService, usuarioService: { list: async () => ({ data: [] }) },
    equipamentoService: { list: async () => ({ equipamentos: [], page: 1, limit: 20,
      total: 0, totalPages: 0, sortBy: 'createdAt', order: 'desc' }) },
    importacaoService: {}, notificacaoService: {}, securityConfig: securityConfig(),
  })
  context.after(() => app.close())
  const cookie = 'onecare_session=viewer'
  assert.equal((await app.inject({ method: 'GET', url: '/equipamentos', headers: { cookie } })).statusCode, 200)
  for (const [method, url, payload] of [
    ['POST', '/equipamentos', {}],
    ['PATCH', '/equipamentos/1', {}],
    ['DELETE', '/equipamentos/1'],
    ['POST', '/equipamentos/importacao/validar'],
    ['PATCH', '/notificacoes/1/ler'],
    ['POST', '/usuarios', {}],
  ]) {
    const response = await app.inject({ method, url, headers: { cookie }, payload })
    assert.equal(response.statusCode, 403, `${method} ${url}`)
    assert.equal(response.json().error, 'ACESSO_NEGADO')
  }
  assert.equal((await app.inject({ method: 'POST', url: '/equipamentos/importacao/validar' })).statusCode, 401)
})

test('payload sensível rejeita propriedade inesperada e JSON comum acima de 64 KiB', async (context) => {
  const authService = {
    resolveSession: async () => null,
    login: async () => ({ token: 'sessao', expiresAt: new Date(Date.now() + 3600000),
      user: { id: 1, username: 'admin', role: 'ADMIN', ativo: true } }),
    logout: async () => {},
  }
  const app = buildApp({ authService, usuarioService: {}, securityConfig: securityConfig() })
  context.after(() => app.close())
  const csrf = await app.inject('/auth/csrf')
  const headers = { origin: 'http://localhost:5173',
    cookie: csrf.headers['set-cookie'].split(';')[0], 'x-csrf-token': csrf.json().csrfToken }
  const unexpected = await app.inject({ method: 'POST', url: '/auth/login', headers,
    payload: { username: 'admin', password: 'senha', role: 'ADMIN' } })
  assert.equal(unexpected.statusCode, 400)
  const oversized = await app.inject({ method: 'POST', url: '/auth/login', headers,
    payload: { username: 'admin', password: 'x'.repeat(70 * 1024) } })
  assert.equal(oversized.statusCode, 413)
  assert.equal(oversized.json().error, 'LIMITE_REQUISICAO')
})

test('limite proporcional da importação retorna 429 com Retry-After', async (context) => {
  const authService = {
    resolveSession: async (token) => token === 'sessao-admin'
      ? { id: 1, username: 'admin', role: 'ADMIN', ativo: true } : null,
    login: async () => ({ token: 'sessao-admin', expiresAt: new Date(Date.now() + 3600000),
      user: { id: 1, username: 'admin', role: 'ADMIN', ativo: true } }),
    logout: async () => {},
  }
  const app = buildApp({ authService, usuarioService: {}, importacaoService: {},
    securityConfig: securityConfig() })
  context.after(() => app.close())
  const { login, cookie } = await loginRequest(app)
  const headers = { origin: 'http://localhost:5173', cookie,
    'x-csrf-token': login.json().csrfToken }
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await app.inject({ method: 'POST',
      url: '/equipamentos/importacao/validar', headers })).statusCode, 415)
  }
  const limited = await app.inject({ method: 'POST',
    url: '/equipamentos/importacao/validar', headers })
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.json().error, 'LIMITE_REQUISICOES')
  assert.equal(limited.headers['retry-after'], '900')
})
