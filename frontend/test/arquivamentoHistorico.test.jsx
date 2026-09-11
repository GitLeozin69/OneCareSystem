import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OneCareApp from '../src/App.jsx'
import { formatDateTime } from '../src/utils/equipamento.js'

const App = () => <OneCareApp initialUser={{ id: 1, username: 'admin', role: 'ADMIN', ativo: true }} />

const activeItem = {
  id: 1,
  serialNumber: 'SN001',
  partNumber: 'PN001',
  cliente: 'Cliente Teste',
  distribuidor: 'Distribuidor Teste',
  patrimonio: null,
  notaFiscal: null,
  contratoOnecare: 'OC2',
  dataInicioOnecare: '2026-01-01',
  dataFimOnecare: '2027-12-31',
  dataUltimaConferencia: null,
  arquivado: false,
  arquivadoEm: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
}
const archivedItem = {
  ...activeItem,
  arquivado: true,
  arquivadoEm: '2026-09-08T12:30:00.000Z',
}
const historyEvent = {
  id: 1,
  anterior: {
    contratoOnecare: 'OC1',
    dataInicioOnecare: '2025-01-01',
    dataFimOnecare: '2026-12-31',
  },
  novo: {
    contratoOnecare: 'OC2',
    dataInicioOnecare: '2026-01-01',
    dataFimOnecare: '2027-12-31',
  },
  substituidoEm: '2026-09-08T12:30:00.000Z',
}

const json = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
})

function list(data, page = 1, total = data.length, limit = 20) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    sort: { sortBy: 'createdAt', order: 'desc' },
  }
}

function history(data, page = 1, total = data.length) {
  return {
    data,
    pagination: {
      page,
      limit: 20,
      total,
      totalPages: Math.ceil(total / 20),
    },
  }
}

let fetchMock
let state

beforeEach(() => {
  state = {
    active: [activeItem],
    archived: [archivedItem],
    history: [historyEvent],
  }
  fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'DELETE') {
      state.active = []
      return json({ item: archivedItem, message: 'ok' })
    }
    if (url.endsWith('/restaurar') && options.method === 'PATCH') {
      state.archived = []
      return json({ item: activeItem, message: 'ok' })
    }
    if (url.includes('/historico-contratos')) {
      const page = Number(new URL(url, 'http://local').searchParams.get('page'))
      return json(history(state.history, page))
    }
    const params = new URL(url, 'http://local').searchParams
    const page = Number(params.get('page'))
    const limit = Number(params.get('limit'))
    if (url.includes('/arquivados')) {
      return json(list(state.archived, page, state.archived.length, limit))
    }
    return json(list(state.active, page, state.active.length, limit))
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => vi.unstubAllGlobals())

const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const input = (label, value) => fireEvent.change(
  screen.getByLabelText(label),
  { target: { value } },
)
const readyActive = () => screen.findByRole('button', { name: 'Arquivar SN001' })
const readyArchived = () => screen.findByRole('button', { name: 'Restaurar SN001' })
const callsByMethod = (method) => fetchMock.mock.calls.filter(
  ([, options]) => options?.method === method,
)

async function openArchived() {
  render(<App />)
  await readyActive()
  click('Equipamentos arquivados')
  await readyArchived()
}

describe('Arquivamento e restauração', () => {
  it('cancela arquivamento após identificar o serial', async () => {
    window.confirm.mockReturnValue(false)
    render(<App />)
    await readyActive()
    click('Arquivar SN001')
    expect(window.confirm).toHaveBeenCalledWith('Arquivar o equipamento SN001?')
    expect(callsByMethod('DELETE')).toHaveLength(0)
    expect(screen.getByText('SN001')).toBeTruthy()
  })

  it('confirma arquivamento, chama DELETE e atualiza a lista ativa', async () => {
    render(<App />)
    await readyActive()
    click('Arquivar SN001')
    await screen.findByText('Equipamento SN001 arquivado com sucesso.')
    expect(callsByMethod('DELETE')[0][0]).toBe('/api/equipamentos/1')
    expect(screen.queryByText('SN001')).toBeNull()
    expect(await screen.findByText('Nenhum equipamento nesta página')).toBeTruthy()
  })

  it('cancela restauração após identificar o serial', async () => {
    await openArchived()
    window.confirm.mockReturnValue(false)
    click('Restaurar SN001')
    expect(window.confirm).toHaveBeenCalledWith('Restaurar o equipamento SN001?')
    expect(callsByMethod('PATCH')).toHaveLength(0)
  })

  it('confirma restauração, chama PATCH e atualiza os arquivados', async () => {
    await openArchived()
    click('Restaurar SN001')
    await screen.findByText('Equipamento SN001 restaurado com sucesso.')
    expect(callsByMethod('PATCH')[0][0]).toBe('/api/equipamentos/1/restaurar')
    expect(screen.queryByText('SN001')).toBeNull()
    expect(await screen.findByText('Nenhum equipamento arquivado')).toBeTruthy()
  })

  it('bloqueia ações e requisições repetidas durante arquivamento', async () => {
    let finish
    fetchMock.mockImplementationOnce(async () => json(list(state.active)))
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    render(<App />)
    await readyActive()
    const archive = screen.getByRole('button', { name: 'Arquivar SN001' })
    fireEvent.click(archive)
    fireEvent.click(archive)
    expect(callsByMethod('DELETE')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Arquivar SN001' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Arquivar SN001' }).textContent).toBe(
      'Arquivando…',
    )
    expect(screen.getByRole('button', { name: 'Editar SN001' }).disabled).toBe(true)
    await act(async () => finish(json({ item: archivedItem })))
    await screen.findByText('Equipamento SN001 arquivado com sucesso.')
  })

  it('mostra erro específico de conflito na restauração', async () => {
    await openArchived()
    fetchMock.mockResolvedValueOnce(json({ error: 'PATRIMONIO_DUPLICADO' }, 409))
    click('Restaurar SN001')
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Já existe um equipamento com esse patrimônio.',
    )
    expect(screen.getByText('SN001')).toBeTruthy()
  })
})

describe('Listagem de arquivados', () => {
  it('renderiza dados, opcionais e data de arquivamento', async () => {
    await openArchived()
    expect(screen.getByRole('heading', { name: 'Equipamentos arquivados' })).toBeTruthy()
    expect(screen.getByText('Distribuidor Teste')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('08/09/2026 às 09:30')).toBeTruthy()
    click('← Voltar aos equipamentos')
    await readyActive()
  })

  it('envia pesquisa, ordenação e paginação para a rota de arquivados', async () => {
    fetchMock.mockImplementation(async (url) => {
      const params = new URL(url, 'http://local').searchParams
      const page = Number(params.get('page'))
      const limit = Number(params.get('limit'))
      if (url.includes('/arquivados')) return json(list([archivedItem], page, 45, limit))
      return json(list([activeItem], page, 1, limit))
    })
    await openArchived()
    input('Pesquisar equipamentos arquivados', '  Cliente  ')
    click('Pesquisar')
    await waitFor(() => {
      const [url] = fetchMock.mock.calls.at(-1)
      expect(new URL(url, 'http://local').searchParams.get('q')).toBe('Cliente')
    })
    input('Ordenar por', 'serialNumber')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('sortBy=serialNumber'))
    input('Ordenar por', 'notaFiscal')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('sortBy=notaFiscal'))
    input('Ordenar por', 'distribuidor')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('sortBy=distribuidor'))
    input('Direção', 'asc')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('order=asc'))
    click('Próxima →')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('page=2'))
    expect(fetchMock.mock.calls.at(-1)[0]).toContain('/api/equipamentos/arquivados?')
  })

  it('mostra carregamento, lista vazia e erro com nova tentativa', async () => {
    let finish
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    render(<App />)
    expect(screen.getByText('Carregando equipamentos…')).toBeTruthy()
    await act(async () => finish(json(list([activeItem]))))
    await readyActive()
    fetchMock.mockRejectedValueOnce(new TypeError('rede'))
    click('Equipamentos arquivados')
    expect((await screen.findByRole('alert')).textContent).toContain('conectar')
    state.archived = []
    click('Tentar novamente')
    await screen.findByText('Nenhum equipamento arquivado')
  })
})

describe('Histórico de contratos', () => {
  it('abre histórico a partir de equipamento ativo e volta', async () => {
    render(<App />)
    await readyActive()
    click('Ver histórico de SN001')
    expect(await screen.findByText('Valor anterior')).toBeTruthy()
    expect(screen.getByText('Valor novo')).toBeTruthy()
    expect(screen.getByText('OC1')).toBeTruthy()
    expect(screen.getByText('OC2')).toBeTruthy()
    expect(screen.getByText('31/12/2026')).toBeTruthy()
    expect(screen.getByText('31/12/2027')).toBeTruthy()
    expect(screen.getByText(/08\/09\/2026 às 09:30/)).toBeTruthy()
    click('← Voltar')
    await readyActive()
  })

  it('abre histórico a partir de arquivado', async () => {
    await openArchived()
    click('Ver histórico de SN001')
    expect(await screen.findByRole('heading', { name: 'SN001' })).toBeTruthy()
    expect(fetchMock.mock.calls.at(-1)[0]).toContain(
      '/api/equipamentos/1/historico-contratos?page=1&limit=20',
    )
    click('← Voltar')
    await readyArchived()
  })

  it('mostra estado vazio com a mensagem especificada', async () => {
    state.history = []
    render(<App />)
    await readyActive()
    click('Ver histórico de SN001')
    expect(await screen.findByText('Nenhuma alteração de contrato registrada')).toBeTruthy()
  })

  it('pagina o histórico pelo backend', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/historico-contratos')) {
        const page = Number(new URL(url, 'http://local').searchParams.get('page'))
        return json(history([historyEvent], page, 21))
      }
      return json(list([activeItem]))
    })
    render(<App />)
    await readyActive()
    click('Ver histórico de SN001')
    await screen.findByText('Valor anterior')
    click('Próxima →')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('page=2'))
  })

  it('mostra erro do histórico e permite tentar novamente', async () => {
    render(<App />)
    await readyActive()
    fetchMock.mockRejectedValueOnce(new TypeError('rede'))
    click('Ver histórico de SN001')
    expect((await screen.findByRole('alert')).textContent).toContain('conectar')
    click('Tentar novamente')
    expect(await screen.findByText('Valor anterior')).toBeTruthy()
  })

  it('abre histórico pela edição e retorna ao formulário', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/historico-contratos')) return json(history([historyEvent]))
      if (url === '/api/equipamentos/1') return json({ item: activeItem })
      return json(list([activeItem]))
    })
    render(<App />)
    await readyActive()
    click('Editar SN001')
    await screen.findByDisplayValue('Cliente Teste')
    click('Ver histórico')
    await screen.findByText('Valor anterior')
    click('← Voltar')
    expect(await screen.findByRole('form', { name: 'Editar equipamento' })).toBeTruthy()
  })

  it('formata instantes no fuso America/Fortaleza', () => {
    expect(formatDateTime('2026-09-08T02:30:00.000Z')).toBe(
      '07/09/2026 às 23:30',
    )
    expect(formatDateTime(null)).toBe('—')
  })
})
