import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import {
  createEquipamentoRecord,
  createFakePrisma,
} from './helpers/fakePrisma.js'

function equipamento(id, overrides = {}) {
  return createEquipamentoRecord({
    id,
    serialNumber: `SN${id}`,
    createdAt: new Date(`2026-01-${String(id).padStart(2, '0')}T12:00:00Z`),
    ...overrides,
  })
}

function historico(id, equipamentoId, contratoOnecare, dataFim, timestamp) {
  return {
    id,
    equipamentoId,
    contratoOnecare,
    dataInicioOnecare: new Date('2025-01-01T00:00:00Z'),
    dataFimOnecare: new Date(`${dataFim}T00:00:00Z`),
    substituidoEm: new Date(timestamp),
  }
}

function setup(context, equipamentos = [], historicos = []) {
  const fake = createFakePrisma(equipamentos, historicos)
  const app = buildApp({
    equipamentoService: createEquipamentoService({ prisma: fake.prisma }),
    logger: false,
  })
  context.after(() => app.close())
  return { ...fake, app }
}

test('arquivamento lógico move equipamento da lista ativa para arquivados', async (context) => {
  const { app, state } = setup(context, [equipamento(1)])
  const archived = await app.inject({ method: 'DELETE', url: '/equipamentos/1' })
  assert.equal(archived.statusCode, 200)
  assert.equal(archived.json().item.arquivado, true)
  assert.ok(archived.json().item.arquivadoEm)
  assert.equal(state.equipamentos.length, 1)

  const active = await app.inject({ method: 'GET', url: '/equipamentos' })
  const inactive = await app.inject({ method: 'GET', url: '/equipamentos/arquivados' })
  assert.deepEqual(active.json().data, [])
  assert.deepEqual(inactive.json().data.map((item) => item.id), [1])
})

test('listagem de arquivados pesquisa os cinco campos e ignora ativos', async (context) => {
  const cases = [
    ['serialNumber', 'ZX900'],
    ['partNumber', 'PN-900'],
    ['patrimonio', 'PAT-900'],
    ['cliente', 'Cliente 900'],
    ['contratoOnecare', 'OC-900'],
  ]

  for (const [field, value] of cases) {
    const { app } = setup(context, [
      equipamento(1, { arquivado: true, [field]: value }),
      equipamento(2, { arquivado: false, [field]: value }),
      equipamento(3, { arquivado: true, patrimonio: null, contratoOnecare: null }),
    ])
    const response = await app.inject({
      method: 'GET',
      url: `/equipamentos/arquivados?q=${encodeURIComponent(value.slice(2))}`,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json().data.map((item) => item.id), [1], field)
  }
})

test('arquivados usam paginação e ordenação da Etapa 3B', async (context) => {
  const records = [1, 2, 3, 4, 5].map((id) => equipamento(id, { arquivado: true }))
  const { app } = setup(context, records)
  const response = await app.inject({
    method: 'GET',
    url: '/equipamentos/arquivados?page=2&limit=2&sortBy=serialNumber&order=asc',
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.map((item) => item.id), [3, 4])
  assert.deepEqual(response.json().pagination, {
    page: 2, limit: 2, total: 5, totalPages: 3,
  })
  assert.deepEqual(response.json().sort, { sortBy: 'serialNumber', order: 'asc' })
})

for (const query of ['page=0', 'limit=101', 'sortBy=id', 'order=ASC', 'status=ATIVO']) {
  test(`arquivados rejeitam parâmetro inválido: ${query}`, async (context) => {
    const { app } = setup(context)
    const response = await app.inject({
      method: 'GET', url: `/equipamentos/arquivados?${query}`,
    })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error, 'PARAMETRO_INVALIDO')
  })
}

test('restauração move equipamento para a lista ativa', async (context) => {
  const { app } = setup(context, [equipamento(1, { arquivado: true })])
  const restored = await app.inject({
    method: 'PATCH', url: '/equipamentos/1/restaurar',
  })
  assert.equal(restored.statusCode, 200)
  assert.equal(restored.json().item.arquivado, false)
  assert.equal(restored.json().item.arquivadoEm, null)
  const active = await app.inject({ method: 'GET', url: '/equipamentos' })
  const inactive = await app.inject({ method: 'GET', url: '/equipamentos/arquivados' })
  assert.deepEqual(active.json().data.map((item) => item.id), [1])
  assert.deepEqual(inactive.json().data, [])
})

for (const records of [[], [equipamento(1)]]) {
  test('restauração rejeita equipamento inexistente ou não arquivado', async (context) => {
    const { app } = setup(context, records)
    const response = await app.inject({
      method: 'PATCH', url: '/equipamentos/1/restaurar',
    })
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error, 'EQUIPAMENTO_NAO_ENCONTRADO')
  })
}

test('histórico vazio retorna paginação sem criar registro', async (context) => {
  const { app, state } = setup(context, [equipamento(1)])
  const response = await app.inject({
    method: 'GET', url: '/equipamentos/1/historico-contratos',
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  })
  assert.equal(state.historicos.length, 0)
})

test('histórico deriva valores novos e ordena do mais recente ao antigo', async (context) => {
  const current = equipamento(1, {
    contratoOnecare: 'OC-ATUAL',
    dataFimOnecare: new Date('2028-12-31T00:00:00Z'),
  })
  const old = historico(1, 1, 'OC-ANTIGO', '2026-12-31', '2026-01-01T12:00:00Z')
  const recent = historico(2, 1, 'OC-INTERMEDIARIO', '2027-12-31', '2027-01-01T12:00:00Z')
  const { app, state } = setup(context, [current], [old, recent])
  const response = await app.inject({
    method: 'GET', url: '/equipamentos/1/historico-contratos',
  })
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.deepEqual(body.data.map((item) => item.id), [2, 1])
  assert.equal(body.data[0].anterior.contratoOnecare, 'OC-INTERMEDIARIO')
  assert.equal(body.data[0].novo.contratoOnecare, 'OC-ATUAL')
  assert.equal(body.data[1].anterior.contratoOnecare, 'OC-ANTIGO')
  assert.equal(body.data[1].novo.contratoOnecare, 'OC-INTERMEDIARIO')
  assert.equal(body.data[0].anterior.dataFimOnecare, '2027-12-31')
  assert.equal(body.data[0].substituidoEm, '2027-01-01T12:00:00.000Z')
  assert.equal(state.historicos.length, 2)
})

test('histórico pagina sem perder o valor novo na fronteira', async (context) => {
  const current = equipamento(1, { contratoOnecare: 'OC4' })
  const histories = [1, 2, 3].map((id) => historico(
    id, 1, `OC${id}`, `202${id + 3}-12-31`, `202${id + 3}-01-01T12:00:00Z`,
  ))
  const { app } = setup(context, [current], histories)
  const response = await app.inject({
    method: 'GET', url: '/equipamentos/1/historico-contratos?page=2&limit=1',
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().pagination, {
    page: 2, limit: 1, total: 3, totalPages: 3,
  })
  assert.equal(response.json().data[0].anterior.contratoOnecare, 'OC2')
  assert.equal(response.json().data[0].novo.contratoOnecare, 'OC3')
})

test('histórico pode ser consultado para equipamento arquivado', async (context) => {
  const { app } = setup(
    context,
    [equipamento(1, { arquivado: true, contratoOnecare: 'OC2' })],
    [historico(1, 1, 'OC1', '2026-12-31', '2026-01-01T12:00:00Z')],
  )
  const response = await app.inject({
    method: 'GET', url: '/equipamentos/1/historico-contratos',
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.length, 1)
})

test('histórico retorna 404 para equipamento inexistente', async (context) => {
  const { app } = setup(context)
  const response = await app.inject({
    method: 'GET', url: '/equipamentos/999/historico-contratos',
  })
  assert.equal(response.statusCode, 404)
})

for (const query of ['page=0', 'limit=101', 'q=teste', 'page=1.5']) {
  test(`histórico rejeita parâmetro inválido: ${query}`, async (context) => {
    const { app } = setup(context, [equipamento(1)])
    const response = await app.inject({
      method: 'GET',
      url: `/equipamentos/1/historico-contratos?${query}`,
    })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error, 'PARAMETRO_INVALIDO')
  })
}
