import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { logBootstrapError, runBootstrap } from '../src/utils/bootstrapError.js'

test('falha real antes do Fastify gera log seguro e encerra com código diferente de zero', () => {
  const databaseSecret = 'senha-bootstrap-nao-pode-vazar'
  const csrfSecret = 'csrf-bootstrap-nao-pode-vazar-123456789'
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: `mysql://usuario:${databaseSecret}@mysql.internal:3306/onecare`,
    COOKIE_SECURE: 'true',
    CSRF_SECRET: csrfSecret,
    ALLOWED_HOSTS: 'api.example',
  }
  delete env.FRONTEND_ORIGIN

  const result = spawnSync(process.execPath, ['scripts/startProduction.js'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env,
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /"event":"backend_bootstrap_failed"/)
  assert.match(result.stderr, /"errorName":"Error"/)
  assert.match(result.stderr, /FRONTEND_ORIGIN é obrigatório em produção\./)
  assert.equal(result.stderr.includes(databaseSecret), false)
  assert.equal(result.stderr.includes(csrfSecret), false)
  assert.equal(result.stderr.includes('mysql.internal'), false)
  assert.equal(result.stderr.includes('mysql://'), false)
  assert.equal(result.stderr.includes('at start'), false)
})

test('erro inesperado expõe somente nome, código e mensagem genérica', () => {
  const lines = []
  const secretValues = [
    'senha-super-secreta',
    'cookie-secreto',
    'token-secreto',
    'csrf-secreto',
    'mysql.private.internal',
  ]
  const error = Object.assign(new Error(
    `mysql://usuario:${secretValues[0]}@${secretValues[4]}:3306/db ` +
    `cookie=${secretValues[1]} token=${secretValues[2]} CSRF_SECRET=${secretValues[3]}`,
  ), { name: 'PrismaClientInitializationError', code: 'P1001' })

  logBootstrapError(error, (line) => lines.push(line))

  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.deepEqual(entry, {
    level: 'error',
    event: 'backend_bootstrap_failed',
    errorName: 'PrismaClientInitializationError',
    message: 'Falha interna durante a inicialização.',
    errorCode: 'P1001',
  })
  for (const secret of secretValues) assert.equal(lines[0].includes(secret), false)
  assert.equal(lines[0].includes(error.stack), false)
})

test('campos de erro não confiáveis não permitem injeção no log', () => {
  const lines = []
  const error = Object.assign(new Error('mensagem privada'), {
    name: 'Error\nDATABASE_URL=mysql://segredo',
    code: 'P1001\ntoken=segredo',
  })

  logBootstrapError(error, (line) => lines.push(line))

  const entry = JSON.parse(lines[0])
  assert.equal(entry.errorName, 'Error')
  assert.equal('errorCode' in entry, false)
  assert.equal(lines[0].includes('DATABASE_URL'), false)
  assert.equal(lines[0].includes('token='), false)
})

test('bootstrap bem-sucedido mantém o processo ativo sem emitir erro', async () => {
  const processRef = {}
  const lines = []
  let started = false

  const succeeded = await runBootstrap(async () => { started = true }, {
    processRef,
    writeLine: (line) => lines.push(line),
  })

  assert.equal(succeeded, true)
  assert.equal(started, true)
  assert.equal('exitCode' in processRef, false)
  assert.deepEqual(lines, [])
})
