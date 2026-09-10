import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createPrismaClient } from '../src/lib/prisma.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'

test('MySQL garante patrimônio único global, múltiplos NULL e conflitos HTTP', {
  skip: process.env.DATABASE_URL ? false : 'requer DATABASE_URL configurada',
}, async () => {
  const url = new URL(process.env.DATABASE_URL)
  assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecare')
  const prisma = createPrismaClient()
  const rollback = new Error('ROLLBACK_PATRIMONIO_TEST')
  const prefix = 'PATR' + randomUUID().replaceAll('-', '').toUpperCase()
  const patrimonio = 'Pat / ' + prefix + '-01'
  let sequence = 0
  const payload = (value) => ({
    serialNumber: prefix + (++sequence),
    partNumber: 'REGRESSION',
    cliente: 'Teste transacional',
    distribuidor: 'Distribuidor Teste',
    patrimonio: value,
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
  })
  const assertConflict = (response, code = 'PATRIMONIO_DUPLICADO') => {
    assert.equal(response.statusCode, 409)
    assert.deepEqual(response.json(), {
      error: code,
      message: code === 'PATRIMONIO_DUPLICADO'
        ? 'Já existe um equipamento com esse patrimônio.'
        : 'Equipamento com esse número de série já existe.',
      details: [],
    })
  }

  try {
    const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
    assert.equal(database.name.toLowerCase(), 'zebraonecare')
    await assert.rejects(prisma.$transaction(async (tx) => {
      // Todas as rotas compartilham a transação de teste, revertida ao final.
      const scopedPrisma = {
        equipamento: tx.equipamento,
        historicoContrato: tx.historicoContrato,
        $transaction: async (callback) => callback(tx),
      }
      const app = buildApp({
        equipamentoService: createEquipamentoService({ prisma: scopedPrisma }),
      })
      try {
        const created = await app.inject({
          method: 'POST', url: '/equipamentos', payload: payload('  ' + patrimonio + '  '),
        })
        assert.equal(created.statusCode, 201)
        const owner = created.json().item
        assert.equal(owner.patrimonio, patrimonio)
        const get = await app.inject({ method: 'GET', url: '/equipamentos/' + owner.id })
        assert.deepEqual(get.json().item, owner)

        const withoutPatrimonio = []
        for (const value of [undefined, null, '', '   ', '\t \n']) {
          const response = await app.inject({
            method: 'POST', url: '/equipamentos', payload: payload(value),
          })
          assert.equal(response.statusCode, 201)
          assert.equal(response.json().item.patrimonio, null)
          withoutPatrimonio.push(response.json().item)
        }
        const other = withoutPatrimonio[0]
        for (const archived of [false, true]) {
          if (archived) {
            const response = await app.inject({ method: 'DELETE', url: '/equipamentos/' + owner.id })
            assert.equal(response.statusCode, 200)
          }
          assertConflict(await app.inject({
            method: 'POST', url: '/equipamentos', payload: payload(patrimonio),
          }))
          assertConflict(await app.inject({
            method: 'PATCH', url: '/equipamentos/' + other.id,
            payload: { patrimonio, contratoOnecare: 'NAO-DEVE-SALVAR' },
          }))
          if (!archived) {
            const response = await app.inject({
              method: 'PATCH', url: '/equipamentos/' + owner.id,
              payload: { patrimonio: '  ' + patrimonio + '  ' },
            })
            assert.equal(response.statusCode, 200)
            assert.equal(response.json().item.patrimonio, patrimonio)
          }
        }
        assert.equal(await tx.historicoContrato.count({ where: { equipamentoId: other.id } }), 0)
        assert.equal((await tx.equipamento.findUnique({ where: { id: other.id } })).contratoOnecare, null)

        // Confirma o índice real, sem depender da consulta prévia da API.
        const directPayload = payload(patrimonio)
        await assert.rejects(tx.equipamento.create({ data: {
          ...directPayload,
          dataInicioOnecare: new Date('2026-01-01T00:00:00Z'),
          dataFimOnecare: new Date('2026-12-31T00:00:00Z'),
        } }), (error) => {
          assert.equal(error.code, 'P2002')
          assert.equal(
            error.meta.driverAdapterError.cause.constraint.index.split('.').at(-1),
            'uq_equipamentos_patrimonio',
          )
          return true
        })

        // Simula uma consulta prévia desatualizada; o MySQL deve arbitrar a escrita.
        const staleDelegate = {
          ...tx.equipamento,
          findUnique: async () => null,
          findFirst: async (args) => args.where.patrimonio
            ? null
            : tx.equipamento.findFirst(args),
        }
        const stalePrisma = {
          ...scopedPrisma,
          equipamento: staleDelegate,
          $transaction: async (callback) => callback({ ...scopedPrisma, equipamento: staleDelegate }),
        }
        const raceApp = buildApp({
          equipamentoService: createEquipamentoService({ prisma: stalePrisma }),
        })
        try {
          assertConflict(await raceApp.inject({
            method: 'POST', url: '/equipamentos', payload: payload(patrimonio),
          }))
          assertConflict(await raceApp.inject({
            method: 'PATCH', url: '/equipamentos/' + other.id, payload: { patrimonio },
          }))
          assertConflict(await raceApp.inject({
            method: 'POST', url: '/equipamentos',
            payload: { ...payload(null), serialNumber: other.serialNumber },
          }), 'SERIAL_DUPLICADO')
        } finally {
          await raceApp.close()
        }
        assert.equal(await tx.equipamento.count({
          where: { serialNumber: { startsWith: prefix }, patrimonio: null },
        }), withoutPatrimonio.length)
        throw rollback
      } finally {
        await app.close()
      }
    }, { timeout: 15000 }), (error) => error === rollback)

    assert.equal(await prisma.equipamento.count({
      where: { serialNumber: { startsWith: prefix } },
    }), 0)
  } finally {
    await prisma.$disconnect()
  }
})
