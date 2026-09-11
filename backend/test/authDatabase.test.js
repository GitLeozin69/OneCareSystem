import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'

import argon2 from 'argon2'

import { buildApp } from '../src/app.js'
import { createPrismaClient } from '../src/lib/prisma.js'
import { createAuthService } from '../src/services/authService.js'

test('login, sessão e logout operam no MySQL real com rollback integral', {
  skip: process.env.DATABASE_URL ? false : 'requer DATABASE_URL configurada',
}, async () => {
  const url = new URL(process.env.DATABASE_URL)
  assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecare')
  const prisma = createPrismaClient()
  const rollback = new Error('ROLLBACK_AUTH_TEST')
  const username = `viewer_${randomUUID().replaceAll('-', '').slice(0, 20)}`
  try {
    const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
    assert.equal(database.name.toLowerCase(), 'zebraonecare')
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({ data: {
        username, senhaHash: await argon2.hash('senha real de teste!', { type: argon2.argon2id }), role: 'VISUALIZADOR',
      } })
      const scoped = { usuario: tx.usuario, sessao: tx.sessao, $transaction: async (operation) => operation(tx) }
      const authService = createAuthService({ prisma: scoped })
      const config = { allowedOrigins: new Set(['http://localhost:5173']), cookieSecure: false, csrfSecret: randomBytes(32).toString('hex') }
      const app = buildApp({ authService, usuarioService: {}, securityConfig: config, logger: false })
      try {
        const csrf = await app.inject('/auth/csrf')
        const csrfCookie = csrf.headers['set-cookie'].split(';')[0]
        const login = await app.inject({ method: 'POST', url: '/auth/login', headers: {
          origin: 'http://localhost:5173', cookie: csrfCookie, 'x-csrf-token': csrf.json().csrfToken,
        }, payload: { username, password: 'senha real de teste!' } })
        assert.equal(login.statusCode, 200)
        const setCookies = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [login.headers['set-cookie']]
        const sessionCookie = setCookies.find((value) => value.startsWith('onecare_session=')).split(';')[0]
        const cookie = `${csrfCookie}; ${sessionCookie}`
        const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })
        assert.equal(me.statusCode, 200)
        assert.equal(me.json().user.username, username)
        assert.equal(await tx.sessao.count({ where: { usuarioId: user.id } }), 1)
        const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: {
          origin: 'http://localhost:5173', cookie, 'x-csrf-token': login.json().csrfToken,
        } })
        assert.equal(logout.statusCode, 200)
        assert.equal(await tx.sessao.count({ where: { usuarioId: user.id } }), 0)
        throw rollback
      } finally { await app.close() }
    }, { timeout: 15000 }), (error) => error === rollback)
    assert.equal(await prisma.usuario.count({ where: { username } }), 0)
  } finally { await prisma.$disconnect() }
})
