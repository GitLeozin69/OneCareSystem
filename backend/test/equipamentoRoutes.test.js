import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { AppError } from '../src/utils/appError.js'
import { createEquipamentoRecord } from './helpers/fakePrisma.js'

function createServiceStub() {
  const item = createEquipamentoRecord()

  return {
    async create() {
      return item
    },
    async findById() {
      return item
    },
    async update() {
      return item
    },
    async archive() {
      return { ...item, arquivado: true }
    },
    async restore() {
      return item
    },
    async listArchived() {
      return {
        equipamentos: [{ ...item, arquivado: true }],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        sortBy: 'createdAt',
        order: 'desc',
      }
    },
    async listContractHistory() {
      return { data: [], page: 1, limit: 20, total: 0, totalPages: 0 }
    },
  }
}

function validPayload() {
  return {
    serialNumber: 'SN001',
    partNumber: 'PN001',
    cliente: 'Cliente Teste',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
  }
}

test('rotas de equipamentos retornam respostas padronizadas', async (context) => {
  const app = buildApp({ equipamentoService: createServiceStub() })
  context.after(() => app.close())

  const createResponse = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: validPayload(),
  })
  assert.equal(createResponse.statusCode, 201)
  assert.equal(createResponse.json().item.dataFimOnecare, '2026-12-31')

  const requests = [
    ['GET', '/equipamentos/1'],
    ['PATCH', '/equipamentos/1', { cliente: 'Novo Cliente' }],
    ['DELETE', '/equipamentos/1'],
    ['PATCH', '/equipamentos/1/restaurar'],
    ['GET', '/equipamentos/arquivados'],
    ['GET', '/equipamentos/1/historico-contratos'],
  ]

  for (const [method, url, payload] of requests) {
    const response = await app.inject({ method, url, payload })
    assert.equal(response.statusCode, 200, `${method} ${url}`)
  }
})

test('validação HTTP retorna erro padronizado', async (context) => {
  const app = buildApp({ equipamentoService: createServiceStub() })
  context.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: { serialNumber: 'SN001' },
  })

  assert.equal(response.statusCode, 400)
  assert.deepEqual(Object.keys(response.json()), [
    'error',
    'message',
    'details',
  ])
})

test('erros de domínio são retornados sem detalhes internos', async (context) => {
  const service = createServiceStub()
  service.findById = async () => {
    throw new AppError({
      statusCode: 404,
      code: 'EQUIPAMENTO_NAO_ENCONTRADO',
      message: 'Equipamento não encontrado.',
    })
  }
  const app = buildApp({ equipamentoService: service })
  context.after(() => app.close())

  const response = await app.inject({
    method: 'GET',
    url: '/equipamentos/999',
  })

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), {
    error: 'EQUIPAMENTO_NAO_ENCONTRADO',
    message: 'Equipamento não encontrado.',
    details: [],
  })
})

test('erros de conexão permanecem genéricos na resposta HTTP', async (context) => {
  const service = createServiceStub()
  service.create = async () => {
    const error = new Error(
      'pool timeout com informações internas que não podem ser expostas',
    )
    error.code = 'P2039'
    error.meta = { driverAdapterError: { cause: { originalCode: '45028' } } }
    throw error
  }
  const app = buildApp({ equipamentoService: service, logger: false })
  context.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: validPayload(),
  })

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.json(), {
    error: 'ERRO_INTERNO',
    message: 'Não foi possível processar a solicitação.',
    details: [],
  })
  assert.doesNotMatch(response.body, /pool timeout|45028/)
})
