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
  'ciclo de equipamento e histórico funcionam com o MySQL real sem persistir dados',
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
        const scopedPrisma = {
          equipamento: transaction.equipamento,
          historicoContrato: transaction.historicoContrato,
          $transaction: async (callback) => callback(transaction),
        }
        const equipamentoService = createEquipamentoService({
          prisma: scopedPrisma,
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
              distribuidor: 'Distribuidor Teste',
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

          const listResponse = await app.inject({
            method: 'GET',
            url: `/equipamentos?q=${serialNumber}&limit=1&sortBy=serialNumber&order=asc`,
          })

          assert.equal(listResponse.statusCode, 200)
          assert.deepEqual(listResponse.json().data, [created])
          assert.equal(listResponse.json().pagination.total, 1)
          assert.equal(listResponse.json().pagination.totalPages, 1)

          const updateResponse = await app.inject({
            method: 'PATCH',
            url: `/equipamentos/${created.id}`,
            payload: {
              contratoOnecare: 'OC-REGRESSION',
              dataFimOnecare: '2027-12-31',
            },
          })
          assert.equal(updateResponse.statusCode, 200)
          const updated = updateResponse.json().item

          const historyResponse = await app.inject({
            method: 'GET',
            url: `/equipamentos/${created.id}/historico-contratos?page=1&limit=20`,
          })
          assert.equal(historyResponse.statusCode, 200)
          assert.deepEqual(historyResponse.json(), {
            data: [
              {
                id: historyResponse.json().data[0].id,
                anterior: {
                  contratoOnecare: null,
                  dataInicioOnecare: '2026-01-01',
                  dataFimOnecare: '2026-12-31',
                },
                novo: {
                  contratoOnecare: 'OC-REGRESSION',
                  dataInicioOnecare: '2026-01-01',
                  dataFimOnecare: '2027-12-31',
                },
                substituidoEm: historyResponse.json().data[0].substituidoEm,
              },
            ],
            pagination: {
              page: 1,
              limit: 20,
              total: 1,
              totalPages: 1,
            },
          })

          const archiveResponse = await app.inject({
            method: 'DELETE',
            url: `/equipamentos/${created.id}`,
          })
          assert.equal(archiveResponse.statusCode, 200)

          const afterArchive = await app.inject({
            method: 'GET',
            url: `/equipamentos?q=${serialNumber}`,
          })
          assert.deepEqual(afterArchive.json().data, [])
          assert.equal(afterArchive.json().pagination.total, 0)

          const archivedList = await app.inject({
            method: 'GET',
            url: `/equipamentos/arquivados?q=${serialNumber}&limit=1&sortBy=serialNumber&order=asc`,
          })
          assert.equal(archivedList.statusCode, 200)
          assert.equal(archivedList.json().data[0].id, created.id)
          assert.equal(archivedList.json().data[0].arquivado, true)
          assert.equal(archivedList.json().pagination.total, 1)

          const archivedHistory = await app.inject({
            method: 'GET',
            url: `/equipamentos/${created.id}/historico-contratos`,
          })
          assert.equal(archivedHistory.statusCode, 200)
          assert.equal(archivedHistory.json().pagination.total, 1)

          const restoreResponse = await app.inject({
            method: 'PATCH',
            url: `/equipamentos/${created.id}/restaurar`,
          })
          assert.equal(restoreResponse.statusCode, 200)
          assert.equal(restoreResponse.json().item.arquivado, false)

          const afterRestore = await app.inject({
            method: 'GET',
            url: `/equipamentos?q=${serialNumber}`,
          })
          assert.equal(afterRestore.statusCode, 200)
          assert.equal(afterRestore.json().data[0].id, updated.id)
          assert.equal(afterRestore.json().pagination.total, 1)

          const archivedAfterRestore = await app.inject({
            method: 'GET',
            url: `/equipamentos/arquivados?q=${serialNumber}`,
          })
          assert.equal(archivedAfterRestore.statusCode, 200)
          assert.deepEqual(archivedAfterRestore.json().data, [])
          assert.equal(archivedAfterRestore.json().pagination.total, 0)

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
