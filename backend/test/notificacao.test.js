import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import {
  millisecondsUntilNextRun,
  startNotificacaoScheduler,
} from '../src/services/notificacaoScheduler.js'
import { createNotificacaoService } from '../src/services/notificacaoService.js'

const fixedNow = new Date('2026-09-11T15:00:00.000Z')

function equipment(id, end, overrides = {}) {
  return {
    id,
    serialNumber: `SN${id}`,
    partNumber: `PN${id}`,
    cliente: 'Cliente Teste',
    patrimonio: null,
    dataFimOnecare: end ? new Date(`${end}T00:00:00.000Z`) : null,
    arquivado: false,
    ...overrides,
  }
}

function harness(equipamentos = [], initialNotifications = []) {
  const notifications = [...initialNotifications]
  let nextId = notifications.reduce((maximum, item) => Math.max(maximum, item.id), 0) + 1
  const prisma = {
    equipamento: {
      async findMany({ where }) {
        return equipamentos.filter((item) => !item.arquivado && item.dataFimOnecare &&
          item.dataFimOnecare <= where.dataFimOnecare.lte)
      },
    },
    notificacao: {
      async createMany({ data }) {
        let count = 0
        for (const candidate of data) {
          const duplicate = notifications.some((item) => item.equipamentoId === candidate.equipamentoId &&
            item.tipo === candidate.tipo && item.eventoChave === candidate.eventoChave)
          if (!duplicate) {
            notifications.push({ id: nextId++, lida: false, createdAt: fixedNow, ...candidate })
            count += 1
          }
        }
        return { count }
      },
      async count({ where = {} }) {
        return notifications.filter((item) => where.lida === undefined || item.lida === where.lida).length
      },
      async findMany({ where = {}, skip, take }) {
        return notifications
          .filter((item) => where.lida === undefined || item.lida === where.lida)
          .sort((left, right) => right.createdAt - left.createdAt || right.id - left.id)
          .slice(skip, skip + take)
          .map((item) => ({ ...item,
            equipamento: equipamentos.find(({ id }) => id === item.equipamentoId) ?? null }))
      },
      async findUnique({ where }) {
        return notifications.find((item) => item.id === where.id) ?? null
      },
      async update({ where, data }) {
        const item = notifications.find((candidate) => candidate.id === where.id)
        Object.assign(item, data)
        return item
      },
      async updateMany({ where, data }) {
        const items = notifications.filter((item) => item.lida === where.lida)
        items.forEach((item) => Object.assign(item, data))
        return { count: items.length }
      },
    },
    async $transaction(callback) {
      return callback(prisma)
    },
  }
  return { prisma, equipamentos, notifications }
}

function setup(equipamentos = [], notifications = []) {
  const context = harness(equipamentos, notifications)
  const service = createNotificacaoService({ prisma: context.prisma, clock: () => fixedNow })
  return { ...context, service }
}

test('rotina cria avisos VENCENDO no dia atual e no limite exato de três meses', async () => {
  const { service, notifications } = setup([equipment(1, '2026-09-11'), equipment(2, '2026-12-11')])
  assert.deepEqual(await service.processExpirations(), { eligible: 2, created: 2, ignored: 0 })
  assert.deepEqual(notifications.map(({ tipo }) => tipo), ['ONECARE_VENCENDO', 'ONECARE_VENCENDO'])
  assert.match(notifications[0].mensagem, /vence hoje/)
})

test('rotina cria aviso VENCIDO e usa mensagem com dias civis', async () => {
  const { service, notifications } = setup([equipment(1, '2026-09-01')])
  await service.processExpirations()
  assert.equal(notifications[0].tipo, 'ONECARE_VENCIDO')
  assert.match(notifications[0].mensagem, /venceu há 10 dias/)
})

test('rotina ignora contrato ativo, sem data final e equipamento arquivado', async () => {
  const { service, notifications } = setup([
    equipment(1, '2026-12-12'), equipment(2, null), equipment(3, '2026-10-01', { arquivado: true }),
  ])
  assert.deepEqual(await service.processExpirations(), { eligible: 0, created: 0, ignored: 0 })
  assert.equal(notifications.length, 0)
})

test('rotina é idempotente em execuções repetidas e concorrentes', async () => {
  const { service, notifications } = setup([equipment(1, '2026-10-01')])
  await Promise.all([service.processExpirations(), service.processExpirations()])
  await service.processExpirations()
  assert.equal(notifications.length, 1)
})

test('renovação gera novo evento e preserva a notificação anterior', async () => {
  const current = equipment(1, '2026-10-01')
  const { service, notifications } = setup([current])
  await service.processExpirations()
  current.dataFimOnecare = new Date('2026-11-01T00:00:00.000Z')
  await service.processExpirations()
  assert.equal(notifications.length, 2)
  assert.deepEqual(notifications.map(({ eventoChave }) => eventoChave), ['2026-10-01', '2026-11-01'])
})

test('mesmo contrato recebe eventos distintos ao entrar em VENCENDO e VENCIDO', async () => {
  const context = harness([equipment(1, '2026-09-12')])
  await createNotificacaoService({ prisma: context.prisma,
    clock: () => new Date('2026-09-11T15:00:00Z') }).processExpirations()
  await createNotificacaoService({ prisma: context.prisma,
    clock: () => new Date('2026-09-13T15:00:00Z') }).processExpirations()
  assert.deepEqual(context.notifications.map(({ tipo }) => tipo),
    ['ONECARE_VENCENDO', 'ONECARE_VENCIDO'])
})

async function appContext() {
  const context = setup([equipment(1, '2026-10-01'), equipment(2, '2026-09-01')])
  await context.service.processExpirations()
  context.notifications[0].createdAt = new Date('2026-09-10T12:00:00Z')
  const app = buildApp({ notificacaoService: context.service })
  await app.ready()
  return { ...context, app }
}

test('GET lista paginada em ordem decrescente e inclui equipamento e contagem global', async (t) => {
  const { app } = await appContext()
  t.after(() => app.close())
  const response = await app.inject('/notificacoes?page=1&limit=1')
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.data.length, 1)
  assert.equal(body.data[0].equipamento.serialNumber, 'SN2')
  assert.equal(body.data[0].equipamento.statusOnecare, 'VENCIDO')
  assert.deepEqual(body.pagination, { page: 1, limit: 1, total: 2, totalPages: 2 })
  assert.equal(body.unreadCount, 2)
})

test('GET filtra lidas e não lidas e aceita os valores padrão', async (t) => {
  const { app, notifications } = await appContext()
  t.after(() => app.close())
  notifications[0].lida = true
  assert.equal((await app.inject('/notificacoes?lida=true')).json().data.length, 1)
  assert.equal((await app.inject('/notificacoes?lida=false')).json().data.length, 1)
  const defaults = (await app.inject('/notificacoes')).json().pagination
  assert.equal(defaults.page, 1)
  assert.equal(defaults.limit, 20)
})

test('GET retorna página vazia quando solicitada além do total', async (t) => {
  const { app } = await appContext()
  t.after(() => app.close())
  const body = (await app.inject('/notificacoes?page=99')).json()
  assert.deepEqual(body.data, [])
  assert.equal(body.pagination.page, 99)
})

test('GET rejeita lida, paginação e parâmetros desconhecidos inválidos', async (t) => {
  const { app } = await appContext()
  t.after(() => app.close())
  for (const query of ['lida=sim', 'page=0', 'limit=101', 'extra=1']) {
    const response = await app.inject(`/notificacoes?${query}`)
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error, 'PARAMETRO_INVALIDO')
  }
})

test('endpoint de contagem retorna apenas notificações não lidas', async (t) => {
  const { app, notifications } = await appContext()
  t.after(() => app.close())
  notifications[0].lida = true
  assert.deepEqual((await app.inject('/notificacoes/nao-lidas/contagem')).json(), { unreadCount: 1 })
})

test('marcar uma notificação como lida é idempotente', async (t) => {
  const { app, notifications } = await appContext()
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'PATCH', url: '/notificacoes/1/ler' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'PATCH', url: '/notificacoes/1/ler' })).statusCode, 200)
  assert.equal(notifications[0].lida, true)
})

test('marcar notificação inexistente retorna 404 padronizado', async (t) => {
  const { app } = await appContext()
  t.after(() => app.close())
  const response = await app.inject({ method: 'PATCH', url: '/notificacoes/999/ler' })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().error, 'NOTIFICACAO_NAO_ENCONTRADA')
})

test('marcar todas atualiza somente não lidas e retorna a quantidade', async (t) => {
  const { app, notifications } = await appContext()
  t.after(() => app.close())
  notifications[0].lida = true
  assert.deepEqual((await app.inject({ method: 'PATCH', url: '/notificacoes/ler-todas' })).json(),
    { updated: 1 })
  assert.equal(notifications.every(({ lida }) => lida), true)
})

test('falha interna da API não expõe detalhes ou credenciais', async (t) => {
  const app = buildApp({
    notificacaoService: {
      async list() { throw new Error('detalhe-interno-sigiloso') },
    },
    logger: false,
  })
  t.after(() => app.close())
  const response = await app.inject('/notificacoes')
  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.json(), {
    error: 'ERRO_INTERNO',
    message: 'Não foi possível processar a solicitação.',
    details: [],
  })
  assert.doesNotMatch(response.body, /detalhe-interno-sigiloso/)
})

test('cálculo do próximo horário usa 08:00 de America/Fortaleza', () => {
  assert.equal(millisecondsUntilNextRun(new Date('2026-09-11T10:30:00Z')), 30 * 60 * 1000)
  assert.equal(millisecondsUntilNextRun(new Date('2026-09-11T11:30:00Z')), 23.5 * 60 * 60 * 1000)
})

test('scheduler agenda uma vez e cancela o timer no encerramento', () => {
  const timers = []
  const cleared = []
  const stop = startNotificacaoScheduler({
    run: async () => {},
    clock: () => fixedNow,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => cleared.push(timer),
  })
  assert.equal(timers.length, 1)
  stop()
  assert.deepEqual(cleared, [timers[0]])
})

test('falha da rotina não interrompe o reagendamento diário', async () => {
  const timers = []
  const errors = []
  startNotificacaoScheduler({
    run: async () => { throw new Error('falha controlada') },
    onError: (error) => errors.push(error.name),
    clock: () => fixedNow,
    setTimer: (callback) => {
      const timer = { callback, unref() {} }
      timers.push(timer)
      return timer
    },
  })
  await timers[0].callback()
  assert.deepEqual(errors, ['Error'])
  assert.equal(timers.length, 2)
})
