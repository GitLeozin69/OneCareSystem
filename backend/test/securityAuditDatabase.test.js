import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import { createTestPrismaClient } from './helpers/testDatabase.js'

const skip = process.env.TEST_DATABASE_URL ? false : 'requer TEST_DATABASE_URL configurada'

for (const concurrentChange of ['contract', 'archive']) {
  test(`auditoria MySQL: escrita obsoleta (${concurrentChange}) retorna 409 e reverte histórico`, { skip }, async () => {
    const prisma = createTestPrismaClient()
    const serialNumber = `AUDIT${randomUUID().replaceAll('-', '').toUpperCase()}`
    const id = randomInt(1_000_000_000, 2_000_000_000)
    // Toda a preparação e a tentativa usam uma transação real. O conflito
    // precisa escapar dela antes de virar resposta HTTP, garantindo rollback.
    const scoped = { $transaction: (operation) => prisma.$transaction(async (tx) => {
      const original = await tx.equipamento.create({ data: {
        id, serialNumber, partNumber: 'FIXTURE', cliente: 'AUDIT FIXTURE', distribuidor: 'AUDIT FIXTURE',
        dataInicioOnecare: new Date('2026-01-01'), dataFimOnecare: new Date('2026-12-31'),
      } })
      // SELECT obsoleto simulado; UPDATE condicional e rollback são reais.
      await tx.equipamento.update({ where: { id }, data: concurrentChange === 'contract'
        ? { dataInicioOnecare: new Date('2026-10-01') } : { arquivado: true } })
      const stateBefore = await tx.equipamento.findUnique({ where: { id } })
      try {
        await operation({ ...tx, equipamento: { ...tx.equipamento, findFirst: async () => original } })
      } catch (error) {
        assert.deepEqual(await tx.equipamento.findUnique({ where: { id } }), stateBefore)
        throw error
      }
      // Falha no teste nunca pode deixar fixtures commitadas.
      throw new Error('A escrita obsoleta não foi bloqueada; rollback obrigatório')
    }) }
    const app = buildApp({ equipamentoService: createEquipamentoService({ prisma: scoped }), logger: false })
    try {
      assert.equal(await prisma.equipamento.count({ where: { id } }), 0)
      const response = await app.inject({ method: 'PATCH', url: `/equipamentos/${id}`,
        payload: { dataFimOnecare: '2026-06-01' } })
      assert.equal(response.statusCode, 409)
      assert.equal(response.json().error, 'CONFLITO_ATUALIZACAO')
      assert.equal(await prisma.equipamento.count({ where: { serialNumber } }), 0)
      assert.equal(await prisma.historicoContrato.count({ where: { equipamentoId: id } }), 0)
    } finally { await app.close(); await prisma.$disconnect() }
  })
}
