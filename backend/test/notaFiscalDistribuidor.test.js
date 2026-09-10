import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import {
  createEquipamentoRecord,
  createFakePrisma,
} from './helpers/fakePrisma.js'

function payload(serialNumber = 'SN001', overrides = {}) {
  return {
    serialNumber,
    partNumber: 'PN001',
    cliente: 'Cliente Teste',
    distribuidor: 'Distribuidor Teste',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2026-12-31',
    ...overrides,
  }
}

function setup(context, equipamentos = []) {
  const fake = createFakePrisma(equipamentos)
  const app = buildApp({
    equipamentoService: createEquipamentoService({ prisma: fake.prisma }),
    logger: false,
  })
  context.after(() => app.close())
  return { ...fake, app }
}

function assertFieldError(response, field) {
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().details[0].field.replace(/^\//, ''), field)
}

test('cadastro salva nota fiscal e distribuidor com trim sem alterar maiúsculas', async (context) => {
  const { app } = setup(context)
  const response = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: payload('SN001', {
      notaFiscal: '  Nf / 001-a  ',
      distribuidor: '  Distribuidor Exemplo Ltda.  ',
    }),
  })

  assert.equal(response.statusCode, 201)
  assert.equal(response.json().item.notaFiscal, 'Nf / 001-a')
  assert.equal(response.json().item.distribuidor, 'Distribuidor Exemplo Ltda.')
})

for (const [label, value, omitted] of [
  ['ausente', undefined, true],
  ['null', null, false],
  ['vazio', '', false],
  ['somente espaços', '   ', false],
]) {
  test(`cadastro rejeita distribuidor ${label}`, async (context) => {
    const { app } = setup(context)
    const body = payload()
    if (omitted) delete body.distribuidor
    else body.distribuidor = value

    const response = await app.inject({
      method: 'POST', url: '/equipamentos', payload: body,
    })

    assertFieldError(response, 'distribuidor')
  })
}

test('nota fiscal ausente, null, vazia ou com espaços é salva como null', async (context) => {
  const { app } = setup(context)
  const values = [undefined, null, '', '   ']

  for (const [index, notaFiscal] of values.entries()) {
    const body = payload(`SN00${index + 1}`)
    if (notaFiscal !== undefined) body.notaFiscal = notaFiscal
    const response = await app.inject({
      method: 'POST', url: '/equipamentos', payload: body,
    })
    assert.equal(response.statusCode, 201)
    assert.equal(response.json().item.notaFiscal, null)
  }
})

test('nota fiscal e distribuidor podem se repetir entre equipamentos', async (context) => {
  const { app, state } = setup(context)

  for (const serialNumber of ['SN001', 'SN002']) {
    const response = await app.inject({
      method: 'POST',
      url: '/equipamentos',
      payload: payload(serialNumber, {
        notaFiscal: 'NF-COMPARTILHADA',
        distribuidor: 'Mesmo Distribuidor',
      }),
    })
    assert.equal(response.statusCode, 201)
  }

  assert.equal(state.equipamentos.length, 2)
  assert.equal(new Set(state.equipamentos.map((item) => item.notaFiscal)).size, 1)
  assert.equal(new Set(state.equipamentos.map((item) => item.distribuidor)).size, 1)
})

test('atualização substitui distribuidor e aplica trim', async (context) => {
  const { app } = setup(context, [createEquipamentoRecord()])
  const response = await app.inject({
    method: 'PATCH',
    url: '/equipamentos/1',
    payload: { distribuidor: '  Novo Distribuidor  ' },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().item.distribuidor, 'Novo Distribuidor')
})

for (const value of [null, '', '   ']) {
  test(`atualização não permite apagar distribuidor com ${JSON.stringify(value)}`, async (context) => {
    const { app, state } = setup(context, [createEquipamentoRecord()])
    const response = await app.inject({
      method: 'PATCH',
      url: '/equipamentos/1',
      payload: { distribuidor: value },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(state.equipamentos[0].distribuidor, 'Distribuidor Teste')
  })
}

test('atualização altera e limpa a nota fiscal', async (context) => {
  const { app } = setup(context, [createEquipamentoRecord({ notaFiscal: 'NF-ANTIGA' })])
  const changed = await app.inject({
    method: 'PATCH', url: '/equipamentos/1', payload: { notaFiscal: '  NF-NOVA  ' },
  })
  assert.equal(changed.statusCode, 200)
  assert.equal(changed.json().item.notaFiscal, 'NF-NOVA')

  for (const notaFiscal of [null, '', '   ']) {
    const cleared = await app.inject({
      method: 'PATCH', url: '/equipamentos/1', payload: { notaFiscal },
    })
    assert.equal(cleared.statusCode, 200)
    assert.equal(cleared.json().item.notaFiscal, null)
  }
})

test('PATCH sem os novos campos preserva seus valores', async (context) => {
  const current = createEquipamentoRecord({
    notaFiscal: 'NF-001', distribuidor: 'Distribuidor Original',
  })
  const { app } = setup(context, [current])
  const response = await app.inject({
    method: 'PATCH', url: '/equipamentos/1', payload: { cliente: 'Novo Cliente' },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().item.notaFiscal, 'NF-001')
  assert.equal(response.json().item.distribuidor, 'Distribuidor Original')
})

test('campos são retornados em criação, consulta, listas, arquivamento e restauração', async (context) => {
  const { app } = setup(context)
  const created = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: payload('SN001', { notaFiscal: 'NF-001' }),
  })
  const id = created.json().item.id
  const assertFields = (item) => {
    assert.equal(item.notaFiscal, 'NF-001')
    assert.equal(item.distribuidor, 'Distribuidor Teste')
  }
  assertFields(created.json().item)

  const found = await app.inject({ method: 'GET', url: `/equipamentos/${id}` })
  assertFields(found.json().item)
  const active = await app.inject({ method: 'GET', url: '/equipamentos' })
  assertFields(active.json().data[0])
  const archived = await app.inject({ method: 'DELETE', url: `/equipamentos/${id}` })
  assertFields(archived.json().item)
  const archivedList = await app.inject({ method: 'GET', url: '/equipamentos/arquivados' })
  assertFields(archivedList.json().data[0])
  const restored = await app.inject({ method: 'PATCH', url: `/equipamentos/${id}/restaurar` })
  assertFields(restored.json().item)
})

for (const [field, value, query] of [
  ['notaFiscal', 'NF-ENCONTRADA-001', 'ENCONTRADA'],
  ['distribuidor', 'Distribuidor Norte Especial', 'Norte Especial'],
]) {
  test(`pesquisa ativa por ${field}`, async (context) => {
    const { app } = setup(context, [
      createEquipamentoRecord({ id: 1, [field]: value }),
      createEquipamentoRecord({ id: 2, serialNumber: 'SN002' }),
    ])
    const response = await app.inject({
      method: 'GET', url: `/equipamentos?q=${encodeURIComponent(query)}`,
    })
    assert.deepEqual(response.json().data.map((item) => item.id), [1])
  })

  test(`pesquisa arquivados por ${field}`, async (context) => {
    const { app } = setup(context, [
      createEquipamentoRecord({ id: 1, arquivado: true, [field]: value }),
      createEquipamentoRecord({ id: 2, serialNumber: 'SN002', arquivado: true }),
    ])
    const response = await app.inject({
      method: 'GET',
      url: `/equipamentos/arquivados?q=${encodeURIComponent(query)}`,
    })
    assert.deepEqual(response.json().data.map((item) => item.id), [1])
  })
}

for (const field of ['notaFiscal', 'distribuidor']) {
  test(`ordena listagens por ${field}`, async (context) => {
    const { app } = setup(context, [
      createEquipamentoRecord({ id: 1, [field]: 'Zulu' }),
      createEquipamentoRecord({ id: 2, serialNumber: 'SN002', [field]: 'Alfa' }),
    ])
    const response = await app.inject({
      method: 'GET', url: `/equipamentos?sortBy=${field}&order=asc`,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json().data.map((item) => item.id), [2, 1])
  })
}

test('alterar nota fiscal e distribuidor não cria histórico de contrato', async (context) => {
  const { app, state } = setup(context, [createEquipamentoRecord()])
  const response = await app.inject({
    method: 'PATCH',
    url: '/equipamentos/1',
    payload: { notaFiscal: 'NF-002', distribuidor: 'Outro Distribuidor' },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(state.historicos.length, 0)
})

test('limites de tamanho são iguais aos definidos no banco', async (context) => {
  const { app } = setup(context)
  const accepted = await app.inject({
    method: 'POST',
    url: '/equipamentos',
    payload: payload('SN001', {
      notaFiscal: 'N'.repeat(100),
      distribuidor: 'D'.repeat(255),
    }),
  })
  assert.equal(accepted.statusCode, 201)

  for (const [field, value] of [
    ['notaFiscal', 'N'.repeat(101)],
    ['distribuidor', 'D'.repeat(256)],
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/equipamentos',
      payload: payload(`SN${field.length}`, { [field]: value }),
    })
    assert.equal(response.statusCode, 422)
    assert.equal(response.json().error, 'CAMPO_MUITO_LONGO')
  }
})
