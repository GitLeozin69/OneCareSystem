import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { readRuntimeConfig } from '../src/config/runtimeConfig.js'
import { installGracefulShutdown } from '../src/utils/gracefulShutdown.js'

const productionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'mysql://user:password@mysql.internal:3306/onecare',
  FRONTEND_ORIGIN: 'https://onecare.example',
  CSRF_SECRET: 'a'.repeat(32),
  COOKIE_SECURE: 'true',
  ALLOWED_HOSTS: 'api.example',
}

test('configuração de produção usa bind público e valida porta, banco, host e segredo', () => {
  const config = readRuntimeConfig(productionEnv)
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.port, 3000)
  assert.equal(config.trustProxy, false)
  assert.equal(config.allowedHosts.has('api.example'), true)
  assert.equal(config.allowedHosts.has('healthcheck.railway.app'), true)
  for (const PORT of ['', '0', '65536', '3000abc', '-1']) {
    assert.throws(() => readRuntimeConfig({ ...productionEnv, PORT }), /PORT/)
  }
  assert.throws(() => readRuntimeConfig({ ...productionEnv, DATABASE_URL: 'postgresql://u:p@db.internal/db' }), /MySQL/)
  assert.throws(() => readRuntimeConfig({ ...productionEnv, ALLOWED_HOSTS: '' }), /ALLOWED_HOSTS/)
  assert.throws(() => readRuntimeConfig({ ...productionEnv, TRUST_PROXY: 'true' }), /TRUST_PROXY/)
  assert.throws(() => readRuntimeConfig({ ...productionEnv, LOG_LEVEL: 'silent' }), /LOG_LEVEL/)
})

test('desenvolvimento mantém defaults locais explícitos', () => {
  const config = readRuntimeConfig({ NODE_ENV: 'development', DATABASE_URL: 'mysql://u:p@127.0.0.1/db' })
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 3000)
  assert.equal(config.allowedHosts, null)
})

test('health, readiness e allowlist de Host são restritivos e genéricos', async (context) => {
  const app = buildApp({ allowedHosts: new Set(['api.example', 'healthcheck.railway.app']),
    readinessCheck: async () => { throw new Error('segredo interno fictício') } })
  context.after(() => app.close())
  assert.equal((await app.inject({ url: '/health', headers: { host: 'healthcheck.railway.app' } })).statusCode, 200)
  const ready = await app.inject({ url: '/ready', headers: { host: 'api.example' } })
  assert.equal(ready.statusCode, 503)
  assert.deepEqual(ready.json(), { status: 'not_ready' })
  assert.equal(ready.body.includes('segredo interno fictício'), false)
  const rejected = await app.inject({ url: '/health', headers: { host: 'attacker.example' } })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.body.includes('attacker.example'), false)
})

test('SIGTERM fecha a aplicação uma única vez e encerra com sucesso', async () => {
  const processRef = new EventEmitter()
  const exits = []
  processRef.exit = (code) => exits.push(code)
  let closes = 0
  const app = { close: async () => { closes += 1 }, log: { info() {}, error() {} } }
  const remove = installGracefulShutdown({ app, processRef, timeoutMs: 50 })
  processRef.emit('SIGTERM')
  processRef.emit('SIGINT')
  await new Promise((resolve) => setImmediate(resolve))
  remove()
  assert.equal(closes, 1)
  assert.deepEqual(exits, [0])
})
