import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OneCareApp from '../src/App.jsx'

const App = () => <OneCareApp initialUser={{ id: 1, username: 'admin', role: 'ADMIN', ativo: true }} />

const equipment = {
  id: 1,
  serialNumber: 'DASH001',
  partNumber: 'TC21',
  cliente: 'Cliente Dashboard',
  distribuidor: 'Distribuidor Dashboard',
  patrimonio: 'PAT-DASH',
  notaFiscal: 'NF-DASH',
  contratoOnecare: 'OC-DASH',
  dataInicioOnecare: '2026-01-01',
  dataFimOnecare: '2026-09-25',
  dataUltimaConferencia: '2026-09-10',
  statusOnecare: 'VENCENDO',
  diasRestantes: 500,
  arquivado: false,
}

const summary = {
  generatedAt: '2026-09-11T10:00:00-03:00',
  totals: {
    totalEquipamentos: 12,
    onecareAtivo: 3,
    onecareVencendo: 4,
    onecareVencido: 5,
    semDataTermino: 0,
    arquivados: 2,
  },
  proximosVencimentos: [equipment],
  vencidosRecentes: [{
    ...equipment,
    id: 2,
    serialNumber: 'VENCIDO002',
    dataFimOnecare: '2026-09-05',
    statusOnecare: 'VENCIDO',
    diasRestantes: -6,
  }],
}

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const equipmentList = (params) => ({
  data: [],
  pagination: { page: Number(params.get('page')), limit: Number(params.get('limit')), total: 0, totalPages: 0 },
  sort: { sortBy: params.get('sortBy'), order: params.get('order') },
})

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn(async (url) => {
    if (url === '/api/dashboard/resumo') return json(summary)
    if (url === '/api/equipamentos/1') return json({ item: equipment })
    if (url === '/api/equipamentos/2') return json({ item: { ...equipment, id: 2, serialNumber: 'VENCIDO002' } })
    return json(equipmentList(new URL(url, 'http://local').searchParams))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

async function openDashboard() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  return screen.findByRole('heading', { name: 'Dashboard OneCare' })
}

describe('Dashboard operacional', () => {
  it('exibe todos os cards e os valores entregues pelo backend, inclusive zero', async () => {
    await openDashboard()
    for (const label of [
      'Total de equipamentos: 12. Abrir listagem.',
      'OneCare ativo: 3. Abrir listagem.',
      'Vencendo: 4. Abrir listagem.',
      'Vencido: 5. Abrir listagem.',
      'Sem data de término: 0.',
      'Arquivados: 2. Abrir listagem.',
    ]) expect(screen.getByLabelText(label)).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/dashboard/resumo')).toHaveLength(1)
  })

  it('mostra as listas, datas, indicadores e dias sem recalcular no frontend', async () => {
    await openDashboard()
    const upcoming = screen.getByRole('heading', { name: 'Próximos vencimentos' }).closest('section')
    const expired = screen.getByRole('heading', { name: 'Vencidos recentemente' }).closest('section')
    expect(within(upcoming).getByText('DASH001')).toBeTruthy()
    expect(within(upcoming).getByText('25/09/2026')).toBeTruthy()
    expect(within(upcoming).getByText('Vencendo')).toBeTruthy()
    expect(within(upcoming).getByText('Vence em 500 dias')).toBeTruthy()
    expect(within(expired).getByText('VENCIDO002')).toBeTruthy()
    expect(within(expired).getByText('Vencido há 6 dias')).toBeTruthy()
    expect(screen.getByText('Atualizado em 11/09/2026 às 10:00.')).toBeTruthy()
  })

  it('abre os detalhes completos de um equipamento', async () => {
    await openDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de DASH001' }))
    expect(await screen.findByRole('heading', { name: 'DASH001' })).toBeTruthy()
    expect(screen.getByText('NF-DASH')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/equipamentos/1', expect.any(Object))
    fireEvent.click(screen.getByRole('button', { name: '← Voltar' }))
    expect(screen.getByRole('heading', { name: 'Dashboard OneCare' })).toBeTruthy()
  })

  it.each([
    ['OneCare ativo: 3. Abrir listagem.', 'ATIVO', 'Equipamentos'],
    ['Vencendo: 4. Abrir listagem.', 'VENCENDO', 'Equipamentos'],
  ])('card %s abre a listagem com filtro do backend', async (card, status, heading) => {
    await openDashboard()
    fireEvent.click(screen.getByLabelText(card))
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
    expect(screen.getByLabelText('Status OneCare').value).toBe(status)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      url.startsWith('/api/equipamentos?') && new URL(url, 'http://local').searchParams.get('status') === status)).toBe(true))
  })

  it('cards de total, vencidos e arquivados abrem seus destinos', async () => {
    await openDashboard()
    fireEvent.click(screen.getByLabelText('Total de equipamentos: 12. Abrir listagem.'))
    expect(await screen.findByRole('heading', { name: 'Equipamentos' })).toBeTruthy()
    expect(new URL(fetchMock.mock.calls.at(-1)[0], 'http://local').searchParams.has('status')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    await screen.findByLabelText('Vencido: 5. Abrir listagem.')
    fireEvent.click(screen.getByLabelText('Vencido: 5. Abrir listagem.'))
    expect(await screen.findByRole('heading', { name: 'Equipamentos vencidos' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    await screen.findByLabelText('Arquivados: 2. Abrir listagem.')
    fireEvent.click(screen.getByLabelText('Arquivados: 2. Abrir listagem.'))
    expect(await screen.findByRole('heading', { name: 'Equipamentos arquivados' })).toBeTruthy()
  })

  it('apresenta carregamento, erro genérico e permite tentar novamente', async () => {
    let rejectRequest
    const defaultResponse = fetchMock.getMockImplementation()
    let failDashboard = true
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/dashboard/resumo' && failDashboard) {
        failDashboard = false
        return new Promise((resolve, reject) => { rejectRequest = reject })
      }
      return defaultResponse(url, options)
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByText('Carregando dashboard…')).toBeTruthy()
    await act(async () => rejectRequest(new TypeError('senha MySQL interna')))
    expect((await screen.findByRole('alert')).textContent).toContain('conectar ao servidor')
    expect(screen.queryByText(/senha MySQL/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByLabelText('Total de equipamentos: 12. Abrir listagem.')).toBeTruthy()
  })

  it('atualiza manualmente com uma nova requisição e mantém os dados anteriores', async () => {
    await openDashboard()
    let resolveRefresh
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar dashboard' }))
    expect(screen.getByLabelText('Total de equipamentos: 12. Abrir listagem.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Atualizando…' }).disabled).toBe(true)
    await act(async () => resolveRefresh(json({ ...summary, totals: { ...summary.totals, totalEquipamentos: 13 } })))
    expect(await screen.findByLabelText('Total de equipamentos: 13. Abrir listagem.')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/dashboard/resumo')).toHaveLength(2)
  })

  it('trata sistema e listas vazias', async () => {
    const emptySummary = {
      ...summary,
      totals: Object.fromEntries(Object.keys(summary.totals).map((key) => [key, 0])),
      proximosVencimentos: [],
      vencidosRecentes: [],
    }
    const defaultResponse = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((url, options) =>
      url === '/api/dashboard/resumo' ? json(emptySummary) : defaultResponse(url, options))
    await openDashboard()
    expect(screen.getByText('Nenhum equipamento operacional cadastrado.')).toBeTruthy()
    expect(screen.getByText('Nenhum equipamento próximo do vencimento.')).toBeTruthy()
    expect(screen.getByText('Nenhum equipamento vencido encontrado.')).toBeTruthy()
  })
})
