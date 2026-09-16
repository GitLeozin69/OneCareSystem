import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createTestPrismaClient as createPrismaClient } from './helpers/testDatabase.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'

const databaseTestEnabled = Boolean(process.env.TEST_DATABASE_URL)

function assertTestDatabase() {
  const url = new URL(process.env.TEST_DATABASE_URL)
  assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecaretest')
}

test('migration criou colunas seguras sem índices únicos', {
  skip: databaseTestEnabled ? false : 'requer TEST_DATABASE_URL configurada',
}, async () => {
  assertTestDatabase()
  const prisma = createPrismaClient()

  try {
    const columns = await prisma.$queryRawUnsafe(`
      SELECT
        COLUMN_NAME AS name,
        DATA_TYPE AS dataType,
        CHARACTER_MAXIMUM_LENGTH AS maxLength,
        IS_NULLABLE AS nullable,
        COLUMN_DEFAULT AS defaultValue,
        COLUMN_KEY AS columnKey
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'equipamentos'
        AND COLUMN_NAME IN ('distribuidor', 'nota_fiscal')
      ORDER BY COLUMN_NAME
    `)
    assert.deepEqual(columns, [
      {
        name: 'distribuidor',
        dataType: 'varchar',
        maxLength: 255n,
        nullable: 'NO',
        defaultValue: null,
        columnKey: '',
      },
      {
        name: 'nota_fiscal',
        dataType: 'varchar',
        maxLength: 100n,
        nullable: 'YES',
        defaultValue: null,
        columnKey: '',
      },
    ])

    const indexes = await prisma.$queryRawUnsafe(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'equipamentos'
        AND COLUMN_NAME IN ('distribuidor', 'nota_fiscal')
    `)
    assert.deepEqual(indexes, [])

    const [counts] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total,
        SUM(distribuidor = 'NÃO INFORMADO') AS backfilled,
        SUM(distribuidor IS NULL) AS nullDistributors
      FROM equipamentos
    `)
    assert.equal(Number(counts.nullDistributors), 0)
    console.log(
      `Registros atuais: ${Number(counts.total)}; preenchidos com NÃO INFORMADO: ${Number(counts.backfilled)}`,
    )
  } finally {
    await prisma.$disconnect()
  }
})

test('MySQL aceita campos repetidos e API mantém regras em transação revertida', {
  skip: databaseTestEnabled ? false : 'requer TEST_DATABASE_URL configurada',
}, async () => {
  assertTestDatabase()
  const prisma = createPrismaClient()
  const rollback = new Error('ROLLBACK_NOTA_DISTRIBUIDOR_TEST')
  const prefix = randomUUID().replaceAll('-', '').toUpperCase()

  try {
    await assert.rejects(prisma.$transaction(async (transaction) => {
      const scopedPrisma = {
        equipamento: transaction.equipamento,
        historicoContrato: transaction.historicoContrato,
        $transaction: async (callback) => callback(transaction),
      }
      const app = buildApp({
        equipamentoService: createEquipamentoService({ prisma: scopedPrisma }),
        logger: false,
      })
      const base = {
        partNumber: 'REGRESSION',
        cliente: 'Teste transacional',
        distribuidor: 'Distribuidor compartilhado',
        notaFiscal: 'NF-COMPARTILHADA',
        dataInicioOnecare: '2026-01-01',
        dataFimOnecare: '2026-12-31',
      }

      try {
        const created = []
        for (const suffix of ['1', '2']) {
          const response = await app.inject({
            method: 'POST',
            url: '/equipamentos',
            payload: { ...base, serialNumber: `NF${prefix}${suffix}` },
          })
          assert.equal(response.statusCode, 201)
          created.push(response.json().item)
        }

        const search = await app.inject({
          method: 'GET',
          url: '/equipamentos?q=NF-COMPARTILHADA&sortBy=distribuidor&order=asc',
        })
        assert.equal(search.statusCode, 200)
        assert.equal(search.json().pagination.total, 2)

        const updated = await app.inject({
          method: 'PATCH',
          url: `/equipamentos/${created[0].id}`,
          payload: { notaFiscal: '   ', distribuidor: '  Distribuidor novo  ' },
        })
        assert.equal(updated.statusCode, 200)
        assert.equal(updated.json().item.notaFiscal, null)
        assert.equal(updated.json().item.distribuidor, 'Distribuidor novo')
        assert.equal(await transaction.historicoContrato.count({
          where: { equipamentoId: created[0].id },
        }), 0)

        throw rollback
      } finally {
        await app.close()
      }
    }), (error) => error === rollback)

    assert.equal(await prisma.equipamento.count({
      where: { serialNumber: { startsWith: `NF${prefix}` } },
    }), 0)
  } finally {
    await prisma.$disconnect()
  }
})
