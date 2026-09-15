import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import argon2 from 'argon2'

import { buildApp } from '../src/app.js'
import { createPrismaClient } from '../src/lib/prisma.js'
import { ARGON2_OPTIONS, createAuthService } from '../src/services/authService.js'
import { changedPassword, httpLogin, originalPassword, passwordPayload } from './helpers/authFixture.js'

test('MySQL: troca própria e revogação integral com dados fictícios e rollback', {
  skip: process.env.DATABASE_URL ? false : 'requer DATABASE_URL configurada',
}, async () => {
  const url = new URL(process.env.DATABASE_URL)
  assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecare')
  const prisma = createPrismaClient()
  const rollback = new Error('ROLLBACK_PASSWORD_CHANGE_TEST')
  const username = `pw_${randomUUID().replaceAll('-', '').slice(0, 20)}`
  try {
    const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
    assert.equal(database.name.toLowerCase(), 'zebraonecare')
    await assert.rejects(prisma.$transaction(async (tx) => {
      // Fixture isolada sem ocupar o adminSlot do administrador existente.
      const user = await tx.usuario.create({ data: { username, role: 'ADMIN', adminSlot: null,
        senhaHash: await argon2.hash(originalPassword, ARGON2_OPTIONS) } })
      const scoped = { usuario: tx.usuario, sessao: tx.sessao,
        $transaction: async (operation) => operation(tx) }
      const app = buildApp({ authService: createAuthService({ prisma: scoped }), usuarioService: {},
        securityConfig: { allowedOrigins: new Set(['http://localhost:5173']), cookieSecure: false,
          csrfSecret: 'segredo-ficticio-integracao-'.repeat(3) }, logger: false })
      try {
        const first = await httpLogin(app, username, originalPassword)
        const second = await httpLogin(app, username, originalPassword)
        assert.equal(first.response.statusCode, 200)
        assert.equal(second.response.statusCode, 200)
        assert.equal(await tx.sessao.count({ where: { usuarioId: user.id } }), 2)
        const wrong = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: first.headers,
          payload: { ...passwordPayload(), senhaAtual: 'Senha incorreta ficticia!' } })
        assert.equal(wrong.statusCode, 400)
        assert.equal(await tx.sessao.count({ where: { usuarioId: user.id } }), 2)
        const change = await app.inject({ method: 'PATCH', url: '/auth/senha', headers: first.headers, payload: passwordPayload() })
        assert.equal(change.statusCode, 204)
        assert.equal(await tx.sessao.count({ where: { usuarioId: user.id } }), 0)
        const saved = await tx.usuario.findUnique({ where: { id: user.id } })
        assert.equal(saved.senhaHash.startsWith('$argon2id$'), true)
        assert.equal(await argon2.verify(saved.senhaHash, changedPassword), true)
        for (const login of [first, second]) {
          assert.equal((await app.inject({ url: '/auth/me', headers: login.headers })).statusCode, 401)
        }
        assert.equal((await httpLogin(app, username, originalPassword)).response.statusCode, 401)
        const fresh = await httpLogin(app, username, changedPassword)
        assert.equal(fresh.response.statusCode, 200)
        assert.equal(fresh.token === first.token || fresh.token === second.token, false)
        assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: fresh.headers })).statusCode, 200)
        throw rollback
      } finally { await app.close() }
    }, { timeout: 30000 }), (error) => error === rollback)
    assert.equal(await prisma.usuario.count({ where: { username } }), 0)
  } finally { await prisma.$disconnect() }
})
