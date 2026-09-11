import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import {
  addCalendarMonths,
  calculateOnecareStatus,
  createOnecareReference,
} from '../src/utils/onecareStatus.js'
import { createEquipamentoRecord, createFakePrisma } from './helpers/fakePrisma.js'

const date = (value) => new Date(`${value}T00:00:00.000Z`)
const fixedNow = new Date('2026-09-10T12:00:00.000Z')
const clock = () => fixedNow

function record(id, endDate, overrides = {}) {
  return createEquipamentoRecord({
    id,
    serialNumber: `STATUS${id}`,
    cliente: `Cliente ${id}`,
    dataFimOnecare: endDate === null ? null : date(endDate),
    ...overrides,
  })
}

function setup(context, equipamentos = []) {
  const fake = createFakePrisma(equipamentos)
  const service = createEquipamentoService({ prisma: fake.prisma, clock })
  const app = buildApp({ equipamentoService: service, logger: false })
  context.after(() => app.close())
  return { app, service, ...fake }
}

test('classifica limites e calcula dias de calendário', async (context) => {
  const reference = createOnecareReference(new Date('2026-01-31T12:00:00.000Z'))
  const cases = [
    ['ontem', '2026-01-30', 'VENCIDO', -1],
    ['hoje', '2026-01-31', 'VENCENDO', 0],
    ['amanhã', '2026-02-01', 'VENCENDO', 1],
    ['limite de três meses', '2026-04-30', 'VENCENDO', 89],
    ['após o limite', '2026-05-01', 'ATIVO', 90],
  ]

  for (const [name, endDate, statusOnecare, diasRestantes] of cases) {
    await context.test(name, () => {
      assert.deepEqual(calculateOnecareStatus(date(endDate), reference), {
        statusOnecare,
        diasRestantes,
      })
    })
  }
})

test('soma três meses corridos com fim de mês, ano e bissexto', () => {
  assert.equal(addCalendarMonths(date('2026-08-31'), 3).toISOString().slice(0, 10), '2026-11-30')
  assert.equal(addCalendarMonths(date('2026-10-31'), 3).toISOString().slice(0, 10), '2027-01-31')
  assert.equal(addCalendarMonths(date('2023-11-30'), 3).toISOString().slice(0, 10), '2024-02-29')
})

test('usa a data civil de America/Fortaleza, não o dia UTC', () => {
  const reference = createOnecareReference(new Date('2026-09-10T02:59:59.000Z'))
  assert.equal(reference.today.toISOString().slice(0, 10), '2026-09-09')
  assert.deepEqual(calculateOnecareStatus(date('2026-09-09'), reference), {
    statusOnecare: 'VENCENDO',
    diasRestantes: 0,
  })
})

test('contrato sem término não recebe classificação nem dias restantes', () => {
  assert.deepEqual(calculateOnecareStatus(null, createOnecareReference(fixedNow)), {
    statusOnecare: null,
    diasRestantes: null,
  })
})

test('expõe status na lista, consulta, cadastro e atualização', async (context) => {
  const { app } = setup(context, [record(1, '2026-09-09')])
  const list = await app.inject({ method: 'GET', url: '/equipamentos' })
  const find = await app.inject({ method: 'GET', url: '/equipamentos/1' })
  const create = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: {
      serialNumber: 'STATUSNOVO', partNumber: 'PN', cliente: 'Cliente',
      distribuidor: 'Distribuidor', dataInicioOnecare: '2026-01-01',
      dataFimOnecare: '2026-12-10',
    },
  })
  const update = await app.inject({
    method: 'PATCH', url: '/equipamentos/1', payload: { dataFimOnecare: '2026-12-11' },
  })

  assert.deepEqual(
    [list.json().data[0], find.json().item].map(({ statusOnecare, diasRestantes }) =>
      ({ statusOnecare, diasRestantes })),
    Array(2).fill({ statusOnecare: 'VENCIDO', diasRestantes: -1 }),
  )
  assert.equal(create.statusCode, 201)
  assert.deepEqual(
    { statusOnecare: create.json().item.statusOnecare, diasRestantes: create.json().item.diasRestantes },
    { statusOnecare: 'VENCENDO', diasRestantes: 91 },
  )
  assert.deepEqual(
    { statusOnecare: update.json().item.statusOnecare, diasRestantes: update.json().item.diasRestantes },
    { statusOnecare: 'ATIVO', diasRestantes: 92 },
  )
})

test('filtra ATIVO, VENCENDO e VENCIDO antes da paginação', async (context) => {
  const { app, prisma } = setup(context, [
    record(1, '2026-09-09'),
    record(2, '2026-09-10'),
    record(3, '2026-12-10'),
    record(4, '2026-12-11'),
    record(5, null),
    record(6, '2026-09-09', { arquivado: true }),
  ])
  const originalFindMany = prisma.equipamento.findMany
  const receivedWhere = []
  prisma.equipamento.findMany = async (args) => {
    receivedWhere.push(args.where)
    return originalFindMany(args)
  }

  const expected = {
    ATIVO: [4],
    VENCENDO: [3, 2],
    VENCIDO: [1],
  }
  for (const [status, ids] of Object.entries(expected)) {
    const response = await app.inject({ method: 'GET', url: `/equipamentos?status=${status}` })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json().data.map((item) => item.id), ids)
    assert.equal(response.json().pagination.total, ids.length)
  }
  assert.equal(receivedWhere.length, 3)
  assert.ok(receivedWhere.every((where) => where.dataFimOnecare && where.arquivado === false))
})

test('combina status com pesquisa, paginação, total e ordenação', async (context) => {
  const { app } = setup(context, [
    record(1, '2026-10-01', { cliente: 'Grupo Alfa' }),
    record(2, '2026-11-01', { cliente: 'Grupo Alfa' }),
    record(3, '2026-12-01', { cliente: 'Grupo Alfa' }),
    record(4, '2026-11-01', { cliente: 'Grupo Beta' }),
    record(5, '2026-12-11', { cliente: 'Grupo Alfa' }),
  ])
  const response = await app.inject({
    method: 'GET',
    url: '/equipamentos?status=VENCENDO&q=Alfa&page=2&limit=1&sortBy=serialNumber&order=asc',
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.map((item) => item.id), [2])
  assert.deepEqual(response.json().pagination, { page: 2, limit: 1, total: 3, totalPages: 3 })
})

test('sem status mantém ativos operacionais inclusive sem término', async (context) => {
  const { app } = setup(context, [record(1, null), record(2, '2026-09-09'),
    record(3, '2026-09-09', { arquivado: true })])
  const response = await app.inject({ method: 'GET', url: '/equipamentos' })

  assert.deepEqual(response.json().data.map((item) => item.id), [2, 1])
  assert.equal(response.json().data.find((item) => item.id === 1).statusOnecare, null)
  assert.equal(response.json().pagination.total, 2)
})

test('rejeita status inválido, vazio, minúsculo ou repetido', async (context) => {
  const { app } = setup(context)
  for (const query of ['status=OUTRO', 'status=', 'status=ativo', 'status=ATIVO&status=VENCIDO']) {
    const response = await app.inject({ method: 'GET', url: `/equipamentos?${query}` })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error, 'PARAMETRO_INVALIDO')
    assert.equal(response.json().details[0].field, 'status')
    assert.doesNotMatch(response.body, /Prisma|MySQL|stack/i)
  }
})

test('campos calculados nunca são enviados ao Prisma para persistência', async () => {
  const fake = createFakePrisma([record(1, '2026-09-09')])
  const originalCreate = fake.prisma.equipamento.create
  const originalUpdate = fake.prisma.equipamento.update
  const persisted = []
  fake.prisma.equipamento.create = async ({ data }) => {
    persisted.push(data)
    return originalCreate({ data })
  }
  fake.prisma.equipamento.update = async ({ where, data }) => {
    persisted.push(data)
    return originalUpdate({ where, data })
  }
  const service = createEquipamentoService({ prisma: fake.prisma, clock })
  await service.create({
    serialNumber: 'STATUSNOVO', partNumber: 'PN', cliente: 'Cliente', distribuidor: 'Distribuidor',
    dataInicioOnecare: '2026-01-01', dataFimOnecare: '2026-12-10',
  })
  await service.update(1, { cliente: 'Cliente alterado' })

  for (const data of persisted) {
    assert.equal(Object.hasOwn(data, 'statusOnecare'), false)
    assert.equal(Object.hasOwn(data, 'diasRestantes'), false)
  }
})
