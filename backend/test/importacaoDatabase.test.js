import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { buildApp } from '../src/app.js'
import { createPrismaClient } from '../src/lib/prisma.js'
import { createImportacaoService } from '../src/services/importacaoService.js'
import { normalizeCreateEquipamento } from '../src/utils/equipamentoValidation.js'
import { workbook, exampleRow, multipartPayload } from './helpers/excelFixture.js'

test('importação MySQL real: prévia sem escrita, confirmação integral e rollback por conflito', {
  skip: process.env.DATABASE_URL ? false : 'requer DATABASE_URL configurada',
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL).pathname.toLowerCase(), '/zebraonecare')
  const prisma = createPrismaClient()
  const prefix = 'IMP' + randomUUID().replaceAll('-', '').toUpperCase()
  const rollback = new Error('ROLLBACK_IMPORTACAO_TEST')
  const where = { serialNumber: { startsWith: prefix } }
  let observed
  let race = false
  // Executa a transação real do serviço, mas impede o commit de fixtures de teste.
  const scoped = { equipamento: prisma.equipamento, async $transaction(callback, options) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (race) await tx.equipamento.create({ data: normalizeCreateEquipamento({
          serialNumber: prefix + '1', partNumber: 'TESTE', cliente: 'CLIENTE TESTE', distribuidor: 'DISTRIBUIDOR TESTE',
          dataInicioOnecare: '2026-01-01', dataFimOnecare: '2027-01-01',
        }) })
        await callback(tx)
        observed = await tx.equipamento.findMany({ where, orderBy: { serialNumber: 'asc' } })
        const ids = observed.map((item) => item.id)
        assert.equal(await tx.historicoContrato.count({ where: { equipamentoId: { in: ids } } }), 0)
        assert.equal(await tx.notificacao.count({ where: { equipamentoId: { in: ids } } }), 0)
        throw rollback
      }, options)
    } catch (error) {
      if (error !== rollback) throw error
      return undefined
    }
  } }
  const app = buildApp({ importacaoService: createImportacaoService({ prisma: scoped }), logger: false })
  try {
    const rows = [exampleRow(prefix + '1'), exampleRow(prefix + '2')]
    rows[1][0] = 'CONTRATO-FICTICIO-B'
    const buffer = await workbook(rows)
    const preview = await app.inject({ method: 'POST', url: '/equipamentos/importacao/validar', ...multipartPayload(buffer) })
    assert.equal(preview.statusCode, 200)
    assert.equal(preview.json().summary.canImport, true)
    assert.equal(await prisma.equipamento.count({ where }), 0)
    const confirm = await app.inject({ method: 'POST', url: '/equipamentos/importacao/confirmar', ...multipartPayload(buffer) })
    assert.equal(confirm.statusCode, 201)
    assert.equal(observed.length, 2)
    assert.equal(observed[1].contratoOnecare, 'CONTRATO-FICTICIO-B')
    assert.equal(observed[0].notaFiscal, null)
    assert.equal(await prisma.equipamento.count({ where }), 0)
    const invalidRows = [exampleRow(prefix + '3'), exampleRow(prefix + '4')]
    invalidRows[1][2] = ''
    const invalid = await app.inject({ method: 'POST', url: '/equipamentos/importacao/confirmar', ...multipartPayload(await workbook(invalidRows)) })
    assert.equal(invalid.statusCode, 422)
    race = true
    const conflict = await app.inject({ method: 'POST', url: '/equipamentos/importacao/confirmar',
      ...multipartPayload(await workbook([exampleRow(prefix + '5'), exampleRow(prefix + '1')])) })
    assert.equal(conflict.statusCode, 409)
    assert.equal(conflict.json().error, 'IMPORTACAO_CONFLITO')
    assert.equal(await prisma.equipamento.count({ where }), 0)
  } finally {
    await app.close()
    await prisma.$disconnect()
  }
})
