import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OneCareApp from '../src/App.jsx'
import EquipamentoDetalhes from '../src/components/EquipamentoDetalhes.jsx'
import OnecareStatus from '../src/components/OnecareStatus.jsx'
import { formatRemainingDays } from '../src/utils/equipamento.js'

const App = () => <OneCareApp initialUser={{ id: 1, username: 'admin', role: 'ADMIN', ativo: true }} />

const items = [
  {
    id: 1, serialNumber: 'ATIVO001', partNumber: 'PN-A', cliente: 'Cliente Alfa',
    distribuidor: 'Distribuidor Alfa', patrimonio: 'PAT-A', notaFiscal: 'NF-A',
    contratoOnecare: 'OC-A', dataInicioOnecare: '2026-01-01', dataFimOnecare: '2027-01-20',
    dataUltimaConferencia: '2026-09-10', statusOnecare: 'ATIVO', diasRestantes: 132,
    arquivado: false,
  },
  {
    id: 2, serialNumber: 'VENCENDO001', partNumber: 'PN-B', cliente: 'Cliente Beta',
    distribuidor: 'Distribuidor Beta', patrimonio: null, notaFiscal: null,
    contratoOnecare: 'OC-B', dataInicioOnecare: '2026-01-01', dataFimOnecare: '2026-09-25',
    dataUltimaConferencia: null, statusOnecare: 'VENCENDO', diasRestantes: 15,
    arquivado: false,
  },
  {
    id: 3, serialNumber: 'VENCIDO001', partNumber: 'PN-C', cliente: 'Cliente Alfa',
    distribuidor: 'Distribuidor Gama', patrimonio: 'PAT-C', notaFiscal: 'NF-C',
    contratoOnecare: 'OC-C', dataInicioOnecare: '2025-01-01', dataFimOnecare: '2026-09-05',
    dataUltimaConferencia: '2026-09-06', statusOnecare: 'VENCIDO', diasRestantes: -5,
    arquivado: false,
  },
  {
    id: 4, serialNumber: 'SEMDATA001', partNumber: 'PN-D', cliente: 'Cliente Delta',
    distribuidor: 'Distribuidor Delta', patrimonio: null, notaFiscal: null,
    contratoOnecare: null, dataInicioOnecare: '2026-01-01', dataFimOnecare: null,
    dataUltimaConferencia: null, statusOnecare: null, diasRestantes: null,
    arquivado: false,
  },
]

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const list = (data, params, total = data.length) => ({
  data,
  pagination: {
    page: Number(params.get('page')), limit: Number(params.get('limit')), total,
    totalPages: Math.ceil(total / Number(params.get('limit'))),
  },
  sort: { sortBy: params.get('sortBy'), order: params.get('order') },
})

let records
let fetchMock

beforeEach(() => {
  records = structuredClone(items)
  fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'PATCH') {
      const id = Number(url.split('/').at(-1))
      const payload = JSON.parse(options.body)
      const current = records.find((item) => item.id === id)
      Object.assign(current, payload, { statusOnecare: 'ATIVO', diasRestantes: 400 })
      return json({ item: current })
    }
    if (/\/equipamentos\/\d+$/.test(url)) {
      return json({ item: records.find((item) => url.endsWith(`/${item.id}`)) })
    }
    const params = new URL(url, 'http://local').searchParams
    let result = records.filter((item) => !params.get('status') || item.statusOnecare === params.get('status'))
    if (params.get('q')) {
      const query = params.get('q').toLocaleLowerCase()
      result = result.filter((item) => Object.values(item).some((value) =>
        typeof value === 'string' && value.toLocaleLowerCase().includes(query)))
    }
    return json(list(result, params))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const lastParams = () => new URL(fetchMock.mock.calls.filter(([url]) =>
  url.startsWith('/api/equipamentos?')).at(-1)[0], 'http://local').searchParams
const ready = () => screen.findByRole('button', { name: 'Editar ATIVO001' })

describe('Indicador de status e prazo', () => {
  it.each([
    ['ATIVO', 2, 'Ativo', 'Vence em 2 dias'],
    ['VENCENDO', 1, 'Vencendo', 'Vence em 1 dia'],
    ['VENCIDO', -5, 'Vencido', 'Vencido há 5 dias'],
    [null, null, 'Sem data de término', 'Prazo não informado'],
  ])('exibe %s com texto visual e acessível', (status, days, label, deadline) => {
    render(<OnecareStatus status={status} diasRestantes={days} />)
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText(deadline)).toBeTruthy()
    expect(screen.getByLabelText(`${label}. ${deadline}.`)).toBeTruthy()
  })

  it('formata hoje e contratos vencidos há um dia sem calcular datas', () => {
    expect(formatRemainingDays(0)).toBe('Vence hoje')
    expect(formatRemainingDays(-1)).toBe('Vencido há 1 dia')
    expect(formatRemainingDays(null)).toBe('Prazo não informado')
  })
})

describe('Filtro e listagem de status', () => {
  it.each([
    ['ATIVO', 'ATIVO001'],
    ['VENCENDO', 'VENCENDO001'],
    ['VENCIDO', 'VENCIDO001'],
  ])('envia %s ao backend e mostra sua resposta', async (status, serial) => {
    render(<App />)
    await ready()
    change('Status OneCare', status)
    await screen.findByText(serial)
    expect(lastParams().get('status')).toBe(status)
    expect(screen.queryByText('SEMDATA001')).toBeNull()
  })

  it('Todos remove status e volta a incluir a resposta geral', async () => {
    render(<App />)
    await ready()
    change('Status OneCare', 'VENCENDO')
    await screen.findByText('VENCENDO001')
    change('Status OneCare', '')
    await screen.findByText('SEMDATA001')
    expect(lastParams().has('status')).toBe(false)
  })

  it('preserva pesquisa, limite e ordenação e retorna à página 1', async () => {
    fetchMock.mockImplementation(async (url) => {
      const params = new URL(url, 'http://local').searchParams
      return json(list([items[0]], params, 45))
    })
    render(<App />)
    await ready()
    change('Pesquisar equipamentos', '  Alfa  ')
    click('Pesquisar')
    change('Ordenar por', 'cliente')
    change('Direção', 'asc')
    change('Por página', '20')
    await waitFor(() => {
      expect(lastParams().get('sortBy')).toBe('cliente')
      expect(lastParams().get('order')).toBe('asc')
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próxima →' }).disabled).toBe(false))
    click('Próxima →')
    await waitFor(() => expect(lastParams().get('page')).toBe('2'))
    change('Status OneCare', 'ATIVO')
    await waitFor(() => expect(lastParams().get('status')).toBe('ATIVO'))
    expect(Object.fromEntries(lastParams())).toEqual({
      page: '1', limit: '20', sortBy: 'cliente', order: 'asc', q: 'Alfa', status: 'ATIVO',
    })
  })

  it('mostra carregamento, erro, nova tentativa e vazio do status', async () => {
    let resolve
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<App />)
    expect(screen.getByText('Carregando equipamentos…')).toBeTruthy()
    await act(async () => resolve(json(list(items, new URLSearchParams({ page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' })))))
    await ready()
    fetchMock.mockRejectedValueOnce(new TypeError('dado interno'))
    change('Status OneCare', 'VENCENDO')
    expect((await screen.findByRole('alert')).textContent).toContain('conectar ao servidor')
    records = records.filter((item) => item.statusOnecare !== 'VENCENDO')
    click('Tentar novamente')
    expect(await screen.findByText('Nenhum equipamento com status Vencendo')).toBeTruthy()
  })

  it('distingue lista geral vazia de pesquisa vazia', async () => {
    records = []
    render(<App />)
    await screen.findByText('Nenhum equipamento nesta página')
    change('Pesquisar equipamentos', 'inexistente')
    click('Pesquisar')
    await screen.findByText('Nenhum resultado encontrado')
  })
})

describe('Tela de equipamentos vencidos', () => {
  it('consulta status VENCIDO, exibe detalhes e preserva data civil', async () => {
    render(<App />)
    await ready()
    click('Equipamentos vencidos')
    expect(await screen.findByRole('heading', { name: 'Equipamentos vencidos' })).toBeTruthy()
    expect(lastParams().get('status')).toBe('VENCIDO')
    expect(screen.getByText('05/09/2026')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Início do OneCare' })).toBeNull()
    expect(screen.queryByText('ATIVO001')).toBeNull()
    click('Ver detalhes de VENCIDO001')
    const heading = screen.getByRole('heading', { name: 'VENCIDO001' })
    const details = heading.closest('section')
    expect(within(details).getByText('OC-C')).toBeTruthy()
    expect(within(details).getByText('Início do OneCare')).toBeTruthy()
    expect(within(details).getByText('01/01/2025')).toBeTruthy()
  })

  it('mostra início não informado nos detalhes quando o valor está ausente', () => {
    render(<EquipamentoDetalhes equipamento={{ ...items[0], dataInicioOnecare: null }} onBack={() => {}} />)
    const label = screen.getByText('Início do OneCare')
    expect(label.nextElementSibling.textContent).toBe('Não informado')
  })

  it('pesquisa, ordena e pagina sempre com status VENCIDO', async () => {
    fetchMock.mockImplementation(async (url) => {
      const params = new URL(url, 'http://local').searchParams
      return json(list([items[2]], params, 45))
    })
    render(<App />)
    await screen.findByRole('button', { name: 'Editar VENCIDO001' })
    click('Equipamentos vencidos')
    await screen.findByRole('heading', { name: 'Equipamentos vencidos' })
    change('Pesquisar equipamentos vencidos', '  Alfa  ')
    click('Pesquisar')
    change('Ordenar por', 'serialNumber')
    change('Direção', 'asc')
    await waitFor(() => {
      expect(lastParams().get('sortBy')).toBe('serialNumber')
      expect(lastParams().get('order')).toBe('asc')
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próxima →' }).disabled).toBe(false))
    click('Próxima →')
    await waitFor(() => expect(lastParams().get('page')).toBe('2'))
    expect(Object.fromEntries(lastParams())).toEqual({
      page: '2', limit: '20', sortBy: 'serialNumber', order: 'asc', q: 'Alfa', status: 'VENCIDO',
    })
  })

  it('mostra mensagem específica quando não há vencidos', async () => {
    records = records.filter((item) => item.statusOnecare !== 'VENCIDO')
    render(<App />)
    await ready()
    click('Equipamentos vencidos')
    expect(await screen.findByText('Nenhum equipamento vencido encontrado.')).toBeTruthy()
  })

  it('refaz a consulta após edição e não mantém status vencido antigo', async () => {
    render(<App />)
    await ready()
    click('Equipamentos vencidos')
    await screen.findByText('VENCIDO001')
    click('Editar VENCIDO001')
    await screen.findByDisplayValue('Cliente Alfa')
    change('Término do OneCare *', '2027-10-15')
    click('Salvar equipamento')
    await screen.findByText('Equipamento atualizado com sucesso.')
    expect(await screen.findByText('Nenhum equipamento vencido encontrado.')).toBeTruthy()
    const listCalls = fetchMock.mock.calls.filter(([url, options]) =>
      options?.method === 'GET' && url.startsWith('/api/equipamentos?'))
    expect(listCalls.at(-1)[0]).toContain('status=VENCIDO')
  })
})
