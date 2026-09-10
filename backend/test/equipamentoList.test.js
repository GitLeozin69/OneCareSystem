import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import { EQUIPAMENTO_SORT_FIELDS } from '../src/utils/equipamentoListValidation.js'
import {
  createEquipamentoRecord,
  createFakePrisma,
} from './helpers/fakePrisma.js'

function record(id, overrides = {}) {
  return createEquipamentoRecord({
    id,
    serialNumber: `SN${String(id).padStart(3, '0')}`,
    createdAt: new Date(`2026-01-${String(id).padStart(2, '0')}T12:00:00.000Z`),
    updatedAt: new Date(`2026-02-${String(id).padStart(2, '0')}T12:00:00.000Z`),
    ...overrides,
  })
}

function setup(context, equipamentos = []) {
  const { prisma } = createFakePrisma(equipamentos)
  const app = buildApp({
    equipamentoService: createEquipamentoService({ prisma }),
    logger: false,
  })
  context.after(() => app.close())
  return app
}

async function get(app, query = '') {
  return app.inject({ method: 'GET', url: `/equipamentos${query}` })
}

function assertInvalidParameter(response, field) {
  assert.equal(response.statusCode, 400)
  const body = response.json()
  assert.equal(body.error, 'PARAMETRO_INVALIDO')
  assert.equal(body.message, `O parâmetro ${field} é inválido.`)
  assert.equal(body.details[0].field, field)
  assert.equal(typeof body.details[0].message, 'string')
}

test('listagem vazia usa paginação e ordenação padrão', async (context) => {
  const response = await get(setup(context))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    data: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
    sort: {
      sortBy: 'createdAt',
      order: 'desc',
    },
  })
})

test('listagem retorna equipamentos com datas serializadas', async (context) => {
  const app = setup(context, [record(1), record(2)])
  const response = await get(app)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.map((item) => item.id), [2, 1])
  assert.equal(response.json().data[0].dataInicioOnecare, '2026-01-01')
  assert.equal(response.json().data[0].createdAt, '2026-01-02T12:00:00.000Z')
})

test('listagem operacional exclui equipamentos arquivados', async (context) => {
  const app = setup(context, [
    record(1),
    record(2, { arquivado: true, arquivadoEm: new Date('2026-09-01T12:00:00Z') }),
  ])
  const response = await get(app)

  assert.deepEqual(response.json().data.map((item) => item.id), [1])
  assert.equal(response.json().pagination.total, 1)
})

test('paginação navega entre várias páginas', async (context) => {
  const app = setup(context, [1, 2, 3, 4, 5].map((id) => record(id)))
  const response = await get(
    app,
    '?page=2&limit=2&sortBy=serialNumber&order=asc',
  )

  assert.deepEqual(response.json().data.map((item) => item.id), [3, 4])
  assert.deepEqual(response.json().pagination, {
    page: 2,
    limit: 2,
    total: 5,
    totalPages: 3,
  })
})

test('página válida sem resultados retorna lista vazia', async (context) => {
  const app = setup(context, [record(1), record(2), record(3)])
  const response = await get(app, '?page=4&limit=2')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data, [])
  assert.equal(response.json().pagination.total, 3)
  assert.equal(response.json().pagination.totalPages, 2)
})

test('total e totalPages consideram somente resultados da pesquisa', async (context) => {
  const app = setup(context, [
    record(1, { cliente: 'Grupo Alfa' }),
    record(2, { cliente: 'Grupo Alfa Norte' }),
    record(3, { cliente: 'Grupo Beta' }),
    record(4, { cliente: 'Grupo Alfa', arquivado: true }),
  ])
  const response = await get(app, '?q=Alfa&limit=1')

  assert.equal(response.json().pagination.total, 2)
  assert.equal(response.json().pagination.totalPages, 2)
  assert.equal(response.json().data.length, 1)
})

const searchCases = [
  ['serialNumber', 'ZX901ABC', 'ZX901'],
  ['partNumber', 'PN-777-ABC', 'PN-777'],
  ['patrimonio', 'PAT-888-ABC', 'PAT-888'],
  ['notaFiscal', 'NF-888-ABC', 'NF-888'],
  ['distribuidor', 'Distribuidor Acme Norte', 'Acme Norte'],
  ['cliente', 'Acme Norte Filial', 'Acme Norte'],
  ['contratoOnecare', 'OC-999-ABC', 'OC-999'],
]

for (const [field, value, query] of searchCases) {
  test(`pesquisa parcialmente por ${field}`, async (context) => {
    const app = setup(context, [
      record(1, { [field]: value }),
      record(2, {
        patrimonio: null,
        contratoOnecare: null,
      }),
    ])
    const response = await get(app, `?q=${encodeURIComponent(query)}`)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json().data.map((item) => item.id), [1])
  })
}

test('pesquisa remove espaços das extremidades', async (context) => {
  const app = setup(context, [
    record(1, { cliente: 'Cliente Encontrado' }),
    record(2, { cliente: 'Outro Cliente' }),
  ])
  const response = await get(app, '?q=%20%20Encontrado%20%20')

  assert.deepEqual(response.json().data.map((item) => item.id), [1])
})

test('q vazio ou somente com espaços não aplica pesquisa', async (context) => {
  const app = setup(context, [record(1), record(2)])

  for (const query of ['?q=', '?q=%20%20%20']) {
    const response = await get(app, query)
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().pagination.total, 2)
  }
})

test('ordenação funciona nas direções crescente e decrescente', async (context) => {
  const app = setup(context, [
    record(1, { cliente: 'Alfa' }),
    record(2, { cliente: 'Zulu' }),
  ])

  const ascending = await get(app, '?sortBy=cliente&order=asc')
  const descending = await get(app, '?sortBy=cliente&order=desc')

  assert.deepEqual(ascending.json().data.map((item) => item.id), [1, 2])
  assert.deepEqual(descending.json().data.map((item) => item.id), [2, 1])
})

const sortableValues = {
  serialNumber: ['AA001', 'ZZ001'],
  partNumber: ['AA-PN', 'ZZ-PN'],
  patrimonio: ['AA-PAT', 'ZZ-PAT'],
  notaFiscal: ['AA-NF', 'ZZ-NF'],
  distribuidor: ['Alfa Distribuição', 'Zulu Distribuição'],
  cliente: ['Alfa', 'Zulu'],
  contratoOnecare: ['AA-OC', 'ZZ-OC'],
  dataInicioOnecare: [
    new Date('2025-01-01T00:00:00.000Z'),
    new Date('2026-01-01T00:00:00.000Z'),
  ],
  dataFimOnecare: [
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2027-01-01T00:00:00.000Z'),
  ],
  createdAt: [
    new Date('2026-01-01T12:00:00.000Z'),
    new Date('2026-02-01T12:00:00.000Z'),
  ],
  updatedAt: [
    new Date('2026-03-01T12:00:00.000Z'),
    new Date('2026-04-01T12:00:00.000Z'),
  ],
}

for (const sortBy of EQUIPAMENTO_SORT_FIELDS) {
  test(`sortBy aceita ${sortBy}`, async (context) => {
    const [first, second] = sortableValues[sortBy]
    const app = setup(context, [
      record(1, { [sortBy]: first }),
      record(2, { [sortBy]: second }),
    ])
    const response = await get(app, `?sortBy=${sortBy}&order=asc`)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json().data.map((item) => item.id), [1, 2])
    assert.deepEqual(response.json().sort, { sortBy, order: 'asc' })
  })
}

test('sortBy fora da lista permitida retorna erro 400', async (context) => {
  const response = await get(setup(context), '?sortBy=id')
  assertInvalidParameter(response, 'sortBy')
})

test('order diferente de asc ou desc retorna erro 400', async (context) => {
  const response = await get(setup(context), '?order=ASC')
  assertInvalidParameter(response, 'order')
})

test('page rejeita zero, negativo, decimal e texto', async (context) => {
  const app = setup(context)

  for (const page of ['0', '-1', '1.5', 'texto', '', '1e2', '9007199254740992']) {
    assertInvalidParameter(await get(app, `?page=${page}`), 'page')
  }
})

test('limit rejeita zero, negativo, decimal e texto', async (context) => {
  const app = setup(context)

  for (const limit of ['0', '-1', '1.5', 'texto']) {
    assertInvalidParameter(await get(app, `?limit=${limit}`), 'limit')
  }
})

test('limit maior que 100 retorna erro 400', async (context) => {
  const response = await get(setup(context), '?limit=101')
  assertInvalidParameter(response, 'limit')
})

test('parâmetro desconhecido retorna erro 400 sem detalhes internos', async (context) => {
  const response = await get(setup(context), '?status=VENCENDO')
  assertInvalidParameter(response, 'status')
  assert.doesNotMatch(response.body, /Prisma|MySQL|DATABASE_URL|stack/i)
})

test('erro inesperado na listagem mantém resposta HTTP genérica', async (context) => {
  const service = {
    async list() {
      throw new Error('mysql://usuario:senha@127.0.0.1/ZebraOneCare')
    },
  }
  const app = buildApp({ equipamentoService: service, logger: false })
  context.after(() => app.close())
  const response = await get(app)

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.json(), {
    error: 'ERRO_INTERNO',
    message: 'Não foi possível processar a solicitação.',
    details: [],
  })
  assert.doesNotMatch(response.body, /usuario|senha|ZebraOneCare/)
})

test('página muito alta retorna vazio sem enviar offset ao Prisma', async (context) => {
  const { prisma } = createFakePrisma([record(1)])
  prisma.equipamento.findMany = async () => {
    assert.fail('Não deve consultar registros de uma página além do total')
  }
  const app = buildApp({ equipamentoService: createEquipamentoService({ prisma }) })
  context.after(() => app.close())
  const response = await get(app, '?page=9007199254740991&limit=100')
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data, [])
  assert.equal(response.json().pagination.total, 1)
})

test('empates usam ID numérico e mantêm páginas sem repetir registros', async (context) => {
  const app = setup(context, [10, 2, 1].map((id) => record(id)))
  for (const order of ['asc', 'desc']) {
    const ids = []
    for (const page of [1, 2, 3]) {
      const response = await get(app, `?sortBy=cliente&order=${order}&limit=1&page=${page}`)
      assert.equal(response.statusCode, 200)
      ids.push(response.json().data[0].id)
    }
    assert.deepEqual(ids, order === 'asc' ? [1, 2, 10] : [10, 2, 1])
  }
})

test('parâmetros repetidos são rejeitados antes de consultar o banco', async (context) => {
  const app = setup(context)
  for (const field of ['q', 'page', 'limit', 'sortBy', 'order']) {
    assertInvalidParameter(await get(app, `?${field}=1&${field}=2`), field)
  }
})

test('limites padrão e máximo são aplicados a listas maiores', async (context) => {
  const app = setup(context, Array.from({ length: 25 }, (_, index) => record(index + 1)))
  const defaultResponse = await get(app)
  assert.equal(defaultResponse.json().data.length, 20)
  assert.equal(defaultResponse.json().pagination.totalPages, 2)
  const maxResponse = await get(app, '?limit=100')
  assert.equal(maxResponse.statusCode, 200)
  assert.equal(maxResponse.json().data.length, 25)
})
