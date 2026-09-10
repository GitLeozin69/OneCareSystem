import assert from 'node:assert/strict'
import test from 'node:test'

import { createEquipamentoService } from '../src/services/equipamentoService.js'
import {
  createEquipamentoRecord,
  createFakePrisma,
} from './helpers/fakePrisma.js'

function validPayload(overrides = {}) {
  return {
    serialNumber: 'sn001',
    partNumber: ' PN001 ',
    cliente: ' Cliente Teste ',
    distribuidor: ' Distribuidor Teste ',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
    ...overrides,
  }
}

async function assertAppError(action, expectedCode, expectedStatus) {
  await assert.rejects(action, (error) => {
    assert.equal(error.code, expectedCode)
    assert.equal(error.statusCode, expectedStatus)
    return true
  })
}

test('cadastro normaliza o serial e os campos textuais', async () => {
  const { prisma } = createFakePrisma()
  const service = createEquipamentoService({ prisma })

  const equipamento = await service.create(
    validPayload({ patrimonio: '  PAT-01  ', contratoOnecare: '' }),
  )

  assert.equal(equipamento.serialNumber, 'SN001')
  assert.equal(equipamento.partNumber, 'PN001')
  assert.equal(equipamento.cliente, 'Cliente Teste')
  assert.equal(equipamento.patrimonio, 'PAT-01')
  assert.equal(equipamento.contratoOnecare, null)
})

test('cadastro rejeita serial com espaços ou caracteres especiais', async (t) => {
  for (const serialNumber of ['SN 001', 'SN-001', 'SN_001']) {
    await t.test(serialNumber, async () => {
      const { prisma } = createFakePrisma()
      const service = createEquipamentoService({ prisma })

      await assertAppError(
        () => service.create(validPayload({ serialNumber })),
        'SERIAL_INVALIDO',
        422,
      )
    })
  }
})

test('cadastro rejeita campo obrigatório ausente', async () => {
  const { prisma } = createFakePrisma()
  const service = createEquipamentoService({ prisma })
  const payload = validPayload()
  delete payload.cliente

  await assertAppError(
    () => service.create(payload),
    'CAMPO_OBRIGATORIO',
    400,
  )
})

test('cadastro rejeita datas inexistentes e intervalo invertido', async (t) => {
  await t.test('data inexistente', async () => {
    const { prisma } = createFakePrisma()
    const service = createEquipamentoService({ prisma })

    await assertAppError(
      () =>
        service.create(validPayload({ dataInicioOnecare: '2026-02-30' })),
      'DATA_INVALIDA',
      422,
    )
  })

  await t.test('intervalo invertido', async () => {
    const { prisma } = createFakePrisma()
    const service = createEquipamentoService({ prisma })

    await assertAppError(
      () =>
        service.create(
          validPayload({
            dataInicioOnecare: '2026-12-31',
            dataFimOnecare: '2026-01-01',
          }),
        ),
      'INTERVALO_DATAS_INVALIDO',
      422,
    )
  })
})

test('cadastro impede serial duplicado após normalização', async () => {
  const existing = createEquipamentoRecord({ serialNumber: 'SN001' })
  const { prisma } = createFakePrisma([existing])
  const service = createEquipamentoService({ prisma })

  await assertAppError(
    () => service.create(validPayload({ serialNumber: 'sn001' })),
    'SERIAL_DUPLICADO',
    409,
  )
})

test('consulta operacional não retorna equipamento arquivado', async () => {
  const archived = createEquipamentoRecord({ arquivado: true })
  const { prisma } = createFakePrisma([archived])
  const service = createEquipamentoService({ prisma })

  await assertAppError(
    () => service.findById(archived.id),
    'EQUIPAMENTO_NAO_ENCONTRADO',
    404,
  )
})

test('atualização sem mudança contratual não cria histórico', async () => {
  const current = createEquipamentoRecord()
  const { prisma, state } = createFakePrisma([current])
  const service = createEquipamentoService({ prisma })

  const updated = await service.update(current.id, { cliente: 'Novo Cliente' })

  assert.equal(updated.cliente, 'Novo Cliente')
  assert.equal(state.historicos.length, 0)
  assert.equal(state.transactionCalls, 1)
})

test('reenvio dos mesmos dados contratuais não cria histórico', async () => {
  const current = createEquipamentoRecord({ contratoOnecare: 'OC-001' })
  const { prisma, state } = createFakePrisma([current])
  const service = createEquipamentoService({ prisma })

  await service.update(current.id, {
    contratoOnecare: 'OC-001',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
  })

  assert.equal(state.historicos.length, 0)
})

test('atualização impede o uso do serial de outro equipamento', async () => {
  const current = createEquipamentoRecord({ id: 1, serialNumber: 'SN001' })
  const duplicate = createEquipamentoRecord({ id: 2, serialNumber: 'SN002' })
  const { prisma } = createFakePrisma([current, duplicate])
  const service = createEquipamentoService({ prisma })

  await assertAppError(
    () => service.update(current.id, { serialNumber: 'sn002' }),
    'SERIAL_DUPLICADO',
    409,
  )
})

test('atualização valida o intervalo usando as datas já persistidas', async () => {
  const current = createEquipamentoRecord()
  const { prisma } = createFakePrisma([current])
  const service = createEquipamentoService({ prisma })

  await assertAppError(
    () => service.update(current.id, { dataInicioOnecare: '2027-01-01' }),
    'INTERVALO_DATAS_INVALIDO',
    422,
  )
})

test('mudança contratual salva os dados anteriores na mesma transação', async () => {
  const current = createEquipamentoRecord({ contratoOnecare: 'OC-001' })
  const { prisma, state } = createFakePrisma([current])
  const service = createEquipamentoService({ prisma })

  const updated = await service.update(current.id, {
    contratoOnecare: 'OC-002',
    dataFimOnecare: '2027-12-31',
  })

  assert.equal(updated.contratoOnecare, 'OC-002')
  assert.equal(state.transactionCalls, 1)
  assert.equal(state.historicos.length, 1)
  assert.equal(state.historicos[0].contratoOnecare, 'OC-001')
  assert.equal(
    state.historicos[0].dataFimOnecare.toISOString().slice(0, 10),
    '2026-12-31',
  )
})

test('arquivamento, listagem de arquivados e restauração funcionam', async () => {
  const current = createEquipamentoRecord()
  const archivedAt = new Date('2026-09-04T15:00:00.000Z')
  const { prisma } = createFakePrisma([current])
  const service = createEquipamentoService({
    prisma,
    clock: () => archivedAt,
  })

  const archived = await service.archive(current.id)
  assert.equal(archived.arquivado, true)
  assert.equal(archived.arquivadoEm, archivedAt)

  const archivedItems = await service.listArchived()
  assert.equal(archivedItems.equipamentos.length, 1)

  await assertAppError(
    () => service.findById(current.id),
    'EQUIPAMENTO_NAO_ENCONTRADO',
    404,
  )

  const restored = await service.restore(current.id)
  assert.equal(restored.arquivado, false)
  assert.equal(restored.arquivadoEm, null)
  assert.equal((await service.listArchived()).equipamentos.length, 0)
})
