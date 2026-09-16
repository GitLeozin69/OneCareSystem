import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createTestPrismaClient as createPrismaClient } from './helpers/testDatabase.js'
import { createDashboardService } from '../src/services/dashboardService.js'

const databaseTestEnabled = Boolean(process.env.TEST_DATABASE_URL)

test(
  'dashboard consulta o MySQL real sem alterar dados',
  { skip: databaseTestEnabled ? false : 'requer TEST_DATABASE_URL configurada' },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL)
    assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecaretest')
    const prisma = createPrismaClient()
    const clock = () => new Date('2026-09-11T13:00:00.000Z')
    const dashboardService = createDashboardService({ prisma, clock })
    const app = buildApp({ dashboardService, logger: false })

    try {
      const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
      assert.equal(database.name.toLowerCase(), 'zebraonecaretest')
      const response = await app.inject({ method: 'GET', url: '/dashboard/resumo' })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.generatedAt, '2026-09-11T10:00:00-03:00')
      assert.equal(body.totals.totalEquipamentos,
        body.totals.onecareAtivo + body.totals.onecareVencendo +
        body.totals.onecareVencido + body.totals.semDataTermino)
      assert.ok(body.proximosVencimentos.length <= 10)
      assert.ok(body.vencidosRecentes.length <= 10)
      assert.ok(body.proximosVencimentos.every((item) => item.statusOnecare === 'VENCENDO'))
      assert.ok(body.vencidosRecentes.every((item) => item.statusOnecare === 'VENCIDO'))
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  },
)
