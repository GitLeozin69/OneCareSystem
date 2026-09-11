import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createDashboardService } from '../src/services/dashboardService.js'
import { createEquipamentoRecord, createFakePrisma } from './helpers/fakePrisma.js'

const date = (value) => value === null ? null : new Date(`${value}T00:00:00.000Z`)
const now = new Date('2026-09-10T12:00:00.000Z')
const clock = () => now

function record(id, endDate, overrides = {}) {
  return createEquipamentoRecord({
    id,
    serialNumber: `DASH${String(id).padStart(2, '0')}`,
    dataFimOnecare: date(endDate),
    ...overrides,
  })
}

function setup(context, equipamentos = []) {
  const fake = createFakePrisma(equipamentos)
  const service = createDashboardService({ prisma: fake.prisma, clock })
  const app = buildApp({ dashboardService: service, logger: false })
  context.after(() => app.close())
  return { app, service, ...fake }
}

test('dashboard vazio retorna todos os totais zerados e listas vazias', async (context) => {
  const { app } = setup(context)
  const response = await app.inject({ method: 'GET', url: '/dashboard/resumo' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    generatedAt: '2026-09-10T09:00:00-03:00',
    totals: {
      totalEquipamentos: 0, onecareAtivo: 0, onecareVencendo: 0,
      onecareVencido: 0, semDataTermino: 0, arquivados: 0,
    },
    proximosVencimentos: [],
    vencidosRecentes: [],
  })
})

test('conta categorias operacionais, sem data e arquivados em uma transação', async () => {
  const { service, state } = setup({ after() {} }, [
    record(1, '2026-12-11'),
    record(2, '2026-12-10'),
    record(3, '2026-09-09'),
    record(4, null),
    record(5, '2026-12-11', { arquivado: true }),
  ])
  const result = await service.summary()

  assert.deepEqual(result.totals, {
    totalEquipamentos: 4, onecareAtivo: 1, onecareVencendo: 1,
    onecareVencido: 1, semDataTermino: 1, arquivados: 1,
  })
  assert.equal(result.totals.totalEquipamentos,
    result.totals.onecareAtivo + result.totals.onecareVencendo +
    result.totals.onecareVencido + result.totals.semDataTermino)
  assert.equal(state.transactionCalls, 1)
})

test('usa Fortaleza e três meses corridos nos limites do dashboard', async (context) => {
  const localClock = () => new Date('2026-01-31T02:59:59.000Z')
  const fake = createFakePrisma([
    record(1, '2026-01-29'),
    record(2, '2026-01-30'),
    record(3, '2026-04-30'),
    record(4, '2026-05-01'),
  ])
  const service = createDashboardService({ prisma: fake.prisma, clock: localClock })
  const app = buildApp({ dashboardService: service, logger: false })
  context.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/dashboard/resumo' })
  assert.deepEqual(response.json().totals, {
    totalEquipamentos: 4, onecareAtivo: 1, onecareVencendo: 2,
    onecareVencido: 1, semDataTermino: 0, arquivados: 0,
  })
})

test('ordena, limita e calcula os campos das duas listas sem arquivados', async (context) => {
  const upcoming = Array.from({ length: 12 }, (_, index) =>
    record(index + 1, `2026-09-${String(11 + index).padStart(2, '0')}`))
  const expired = Array.from({ length: 12 }, (_, index) =>
    record(index + 20, `2026-08-${String(20 + index).padStart(2, '0')}`))
  const archived = record(99, '2026-09-11', { arquivado: true })
  const { app } = setup(context, [...upcoming, ...expired, archived])

  const body = (await app.inject({ method: 'GET', url: '/dashboard/resumo' })).json()
  assert.equal(body.proximosVencimentos.length, 10)
  assert.deepEqual(body.proximosVencimentos.map((item) => item.dataFimOnecare),
    [...body.proximosVencimentos.map((item) => item.dataFimOnecare)].sort())
  assert.equal(body.vencidosRecentes.length, 10)
  assert.deepEqual(body.vencidosRecentes.map((item) => item.dataFimOnecare),
    [...body.vencidosRecentes.map((item) => item.dataFimOnecare)].sort().reverse())
  assert.ok([...body.proximosVencimentos, ...body.vencidosRecentes]
    .every((item) => item.id !== 99))
  assert.deepEqual(
    Object.keys(body.proximosVencimentos[0]),
    ['id', 'serialNumber', 'partNumber', 'cliente', 'distribuidor',
      'contratoOnecare', 'dataFimOnecare', 'statusOnecare', 'diasRestantes'],
  )
  assert.equal(body.proximosVencimentos[0].statusOnecare, 'VENCENDO')
  assert.equal(body.proximosVencimentos[0].diasRestantes, 1)
  assert.equal(body.vencidosRecentes[0].statusOnecare, 'VENCIDO')
})

test('falha interna do dashboard permanece genérica', async (context) => {
  const app = buildApp({ dashboardService: { summary: async () => {
    throw new Error('senha interna MySQL')
  } }, logger: false })
  context.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/dashboard/resumo' })
  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.json(), {
    error: 'ERRO_INTERNO',
    message: 'Não foi possível processar a solicitação.',
    details: [],
  })
  assert.doesNotMatch(response.body, /senha interna|MySQL/)
})
