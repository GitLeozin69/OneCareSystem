import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import { createEquipamentoRecord, createFakePrisma } from './helpers/fakePrisma.js'

const expectedConflict = {
  error: 'PATRIMONIO_DUPLICADO',
  message: 'Já existe um equipamento com esse patrimônio.',
  details: [],
}

function payload(serialNumber, patrimonio) {
  return {
    serialNumber,
    patrimonio,
    cliente: 'Teste',
    partNumber: 'PN01',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
  }
}

function setup(context, records = []) {
  const { prisma, state } = createFakePrisma(records)
  const app = buildApp({
    equipamentoService: createEquipamentoService({ prisma }),
  })
  context.after(() => app.close())
  return { app, prisma, state }
}

test('POST aceita patrimônio único, aplica trim e preserva formato', async (context) => {
  const { app } = setup(context)
  const response = await app.inject({
    method: 'POST', url: '/equipamentos',
    payload: payload('SN01', '  Pat / 001-A  '),
  })
  assert.equal(response.statusCode, 201)
  assert.equal(response.json().item.patrimonio, 'Pat / 001-A')
})

for (const arquivado of [false, true]) {
  for (const method of ['POST', 'PATCH']) {
    test(method + ' rejeita patrimônio de outro equipamento, arquivado=' + arquivado, async (context) => {
      const owner = createEquipamentoRecord({
        id: 1, serialNumber: 'SN01', patrimonio: 'PAT01', arquivado,
      })
      const other = createEquipamentoRecord({
        id: 2, serialNumber: 'SN02', patrimonio: 'PAT02',
      })
      const { app, state } = setup(context, [owner, other])
      const response = await app.inject({
        method,
        url: method === 'POST' ? '/equipamentos' : '/equipamentos/2',
        payload: method === 'POST'
          ? payload('SN03', '  PAT01  ')
          : { patrimonio: '  PAT01  ', contratoOnecare: 'CONTRATO-NOVO' },
      })
      assert.equal(response.statusCode, 409)
      assert.deepEqual(response.json(), expectedConflict)
      assert.equal(state.equipamentos.length, 2)
      assert.equal(state.equipamentos[1].patrimonio, 'PAT02')
      assert.equal(state.historicos.length, 0)
    })
  }
}

test('PATCH mantém patrimônio próprio e permite mudar para um disponível', async (context) => {
  const current = createEquipamentoRecord({ patrimonio: 'PAT01' })
  const { app, state } = setup(context, [current])
  for (const patrimonio of ['  PAT01  ', 'Pat / 002']) {
    const response = await app.inject({
      method: 'PATCH', url: '/equipamentos/1', payload: { patrimonio },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().item.patrimonio, patrimonio.trim())
  }
  assert.equal(state.historicos.length, 0)
})

test('vários equipamentos aceitam patrimônio omitido, null, vazio ou espaços', async (context) => {
  const { app, state } = setup(context)
  const inputs = [undefined, null, '', '   ', '\t \n']
  for (const [index, patrimonio] of inputs.entries()) {
    const response = await app.inject({
      method: 'POST', url: '/equipamentos',
      payload: payload('SN' + index, patrimonio),
    })
    assert.equal(response.statusCode, 201)
    assert.equal(response.json().item.patrimonio, null)
  }
  assert.equal(state.equipamentos.length, inputs.length)
})

for (const patrimonio of [null, '', '   ']) {
  test('PATCH permite limpar patrimônio com ' + JSON.stringify(patrimonio), async (context) => {
    const { app } = setup(context, [createEquipamentoRecord({ patrimonio: 'PAT01' })])
    const response = await app.inject({
      method: 'PATCH', url: '/equipamentos/1', payload: { patrimonio },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().item.patrimonio, null)
  })
}

for (const method of ['POST', 'PATCH']) {
  for (const field of ['patrimonio', 'serialNumber']) {
    test(method + ' traduz conflito de ' + field + ' ocorrido após a consulta prévia', async (context) => {
      const { app, prisma, state } = setup(context, [
        createEquipamentoRecord({ patrimonio: 'PAT01' }),
      ])
      const error = Object.assign(new Error('Detalhes internos do MySQL'), {
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: {
                index: 'equipamentos.uq_equipamentos_' +
                  (field === 'patrimonio' ? 'patrimonio' : 'serial_number'),
              },
            },
          },
        },
      })
      prisma.equipamento[method === 'POST' ? 'create' : 'update'] = async () => {
        throw error
      }
      const response = await app.inject({
        method,
        url: method === 'POST' ? '/equipamentos' : '/equipamentos/1',
        payload: method === 'POST' ? payload('SN02', 'PAT02') : { [field]: 'NOVO' },
      })
      assert.equal(response.statusCode, 409)
      assert.deepEqual(response.json(), field === 'patrimonio' ? expectedConflict : {
        error: 'SERIAL_DUPLICADO',
        message: 'Equipamento com esse número de série já existe.',
        details: [],
      })
      assert.equal(state.equipamentos.length, 1)
      assert.doesNotMatch(response.body, /MySQL|P2002|constraint/)
    })
  }
}

test('middleware identifica índices e campos; conflitos desconhecidos permanecem genéricos', async (context) => {
  const metas = [
    { target: ['patrimonio'] },
    { target: 'uq_equipamentos_patrimonio' },
    { driverAdapterError: { cause: { constraint: { fields: ['patrimonio'] } } } },
    { target: ['serialNumber'] },
    { target: ['serial_number'] },
    { target: 'uq_equipamentos_serial_number' },
    { target: 'outro_indice' },
    {},
  ]
  for (const [index, meta] of metas.entries()) {
    const app = buildApp({
      equipamentoService: {
        async create() {
          throw Object.assign(new Error('Informação interna'), { code: 'P2002', meta })
        },
      },
    })
    context.after(() => app.close())
    const response = await app.inject({
      method: 'POST', url: '/equipamentos', payload: payload('SN01', 'PAT01'),
    })
    assert.equal(response.statusCode, index < 6 ? 409 : 500)
    assert.equal(response.json().error, index < 3
      ? 'PATRIMONIO_DUPLICADO'
      : index < 6 ? 'SERIAL_DUPLICADO' : 'ERRO_INTERNO')
    assert.doesNotMatch(response.body, /Informação interna|outro_indice/)
  }
})
