import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import {
  createPrismaClient,
  normalizeDatabaseUrl,
} from '../src/lib/prisma.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'

const databaseTestEnabled = Boolean(process.env.DATABASE_URL)

test('configura host, pool e timeouts sem expor credenciais', () => {
  const normalized = new URL(
    normalizeDatabaseUrl('mysql://usuario:segredo@localhost:3306/onecare'),
  )

  assert.equal(normalized.hostname, '127.0.0.1')
  assert.equal(normalized.searchParams.get('connectionLimit'), '10')
  assert.equal(normalized.searchParams.get('minimumIdle'), '1')
  assert.equal(normalized.searchParams.get('acquireTimeout'), '10000')
  assert.equal(normalized.searchParams.get('connectTimeout'), '5000')
})

test(
  'POST e GET de equipamento funcionam com o MySQL real',
  { skip: databaseTestEnabled ? false : 'requer DATABASE_URL configurada' },
  async () => {
    const url = new URL(process.env.DATABASE_URL)
    assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecare')
    const prisma = createPrismaClient()
    const rollback = new Error('ROLLBACK_TEST_TRANSACTION')
    let serialNumber

    try {
      const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
      assert.equal(database.name.toLowerCase(), 'zebraonecare')
      await prisma.$transaction(async (transaction) => {
        const equipamentoService = createEquipamentoService({
          prisma: transaction,
        })
        const app = buildApp({ equipamentoService, logger: false })

        try {
          serialNumber = `REG${process.pid}${Date.now()}`
          const createResponse = await app.inject({
            method: 'POST',
            url: '/equipamentos',
            payload: {
              serialNumber,
              partNumber: 'REGRESSION',
              cliente: 'Teste de regressão',
              dataInicioOnecare: '2026-01-01',
              dataFimOnecare: '2026-12-31',
            },
          })

          assert.equal(createResponse.statusCode, 201)
          const created = createResponse.json().item
          assert.equal(created.serialNumber, serialNumber)

          const getResponse = await app.inject({
            method: 'GET',
            url: `/equipamentos/${created.id}`,
          })

          assert.equal(getResponse.statusCode, 200)
          assert.deepEqual(getResponse.json().item, created)

          throw rollback
        } finally {
          await app.close()
        }
      })
    } catch (error) {
      assert.equal(error, rollback)
      assert.equal(
        await prisma.equipamento.findUnique({ where: { serialNumber } }),
        null,
      )
    } finally {
      await prisma.$disconnect()
    }
  },
)
