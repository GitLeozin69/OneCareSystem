import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createPrismaClient } from '../src/lib/prisma.js'
import { createNotificacaoService } from '../src/services/notificacaoService.js'

test('notificações operam no MySQL real com unicidade e rollback dos dados de teste', {
  skip: process.env.DATABASE_URL ? false : 'requer DATABASE_URL configurada',
}, async () => {
  const url = new URL(process.env.DATABASE_URL)
  assert.equal(decodeURIComponent(url.pathname.slice(1)).toLowerCase(), 'zebraonecare')
  const prisma = createPrismaClient()
  const rollback = new Error('ROLLBACK_NOTIFICACAO_TEST')
  const serial = `NOT${randomUUID().replaceAll('-', '').toUpperCase()}`

  try {
    const [database] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS name')
    assert.equal(database.name.toLowerCase(), 'zebraonecare')
    await assert.rejects(prisma.$transaction(async (tx) => {
      const created = await tx.equipamento.create({ data: {
        serialNumber: serial,
        partNumber: 'TESTE-NOTIFICACAO',
        cliente: 'Teste transacional',
        distribuidor: 'Distribuidor Teste',
        dataInicioOnecare: new Date('2026-01-01T00:00:00Z'),
        dataFimOnecare: new Date('2026-10-01T00:00:00Z'),
      } })
      const scopedPrisma = {
        equipamento: {
          findMany: (args) => tx.equipamento.findMany({
            ...args,
            where: { AND: [args.where, { id: created.id }] },
          }),
        },
        notificacao: tx.notificacao,
        $transaction: async (callback) => callback(tx),
      }
      const service = createNotificacaoService({
        prisma: scopedPrisma,
        clock: () => new Date('2026-09-11T15:00:00Z'),
      })
      const app = buildApp({ notificacaoService: service })
      try {
        assert.deepEqual(await service.processExpirations(), { eligible: 1, created: 1, ignored: 0 })
        assert.deepEqual(await service.processExpirations(), { eligible: 1, created: 0, ignored: 1 })
        assert.equal(await tx.notificacao.count({ where: { equipamentoId: created.id } }), 1)

        const list = await app.inject('/notificacoes?lida=false')
        assert.equal(list.statusCode, 200)
        assert.ok(list.json().data.some(({ equipamento }) => equipamento.id === created.id))
        const notification = await tx.notificacao.findFirst({ where: { equipamentoId: created.id } })
        assert.equal((await app.inject({ method: 'PATCH',
          url: `/notificacoes/${notification.id}/ler` })).statusCode, 200)
        assert.equal((await app.inject('/notificacoes/nao-lidas/contagem')).statusCode, 200)

        await assert.rejects(tx.notificacao.create({ data: {
          equipamentoId: created.id,
          tipo: notification.tipo,
          mensagem: 'Duplicada',
          eventoChave: notification.eventoChave,
        } }), (error) => error.code === 'P2002')
        throw rollback
      } finally {
        await app.close()
      }
    }, { timeout: 15000 }), (error) => error === rollback)
    assert.equal(await prisma.equipamento.count({ where: { serialNumber: serial } }), 0)
  } finally {
    await prisma.$disconnect()
  }
})
