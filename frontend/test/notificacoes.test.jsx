import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const equipamento = {
  id: 1, serialNumber: 'SN001', partNumber: 'PN001', cliente: 'Cliente Teste',
  patrimonio: 'PAT-01', distribuidor: 'Distribuidor Teste', contratoOnecare: null,
  notaFiscal: null, dataInicioOnecare: '2026-01-01', dataFimOnecare: '2026-10-01',
  dataUltimaConferencia: null, statusOnecare: 'VENCENDO', diasRestantes: 20,
  arquivado: false,
}
const archived = { ...equipamento, id: 2, serialNumber: 'SN002', arquivado: true,
  statusOnecare: 'VENCIDO', diasRestantes: -5 }

function notification(id, item = equipamento, lida = false) {
  return { id, tipo: item.statusOnecare === 'VENCIDO' ? 'ONECARE_VENCIDO' : 'ONECARE_VENCENDO',
    mensagem: `Aviso do equipamento ${item.serialNumber}.`, lida,
    createdAt: '2026-09-11T12:00:00.000Z', equipamento: item }
}

let notifications
let fetchMock
beforeEach(() => {
  notifications = [notification(1), notification(2, archived), notification(3, equipamento, true)]
  fetchMock = vi.fn(async (url, options = {}) => {
    if (url === '/api/notificacoes/nao-lidas/contagem') {
      return json({ unreadCount: notifications.filter(({ lida }) => !lida).length })
    }
    if (url.startsWith('/api/notificacoes?')) {
      const params = new URL(url, 'http://local').searchParams
      const requested = params.get('lida')
      const data = requested === null ? notifications
        : notifications.filter(({ lida }) => String(lida) === requested)
      return json({ data, pagination: { page: Number(params.get('page')), limit: 20,
        total: data.length, totalPages: 1 },
      unreadCount: notifications.filter(({ lida }) => !lida).length })
    }
    if (url === '/api/notificacoes/ler-todas' && options.method === 'PATCH') {
      const updated = notifications.filter(({ lida }) => !lida).length
      notifications = notifications.map((item) => ({ ...item, lida: true }))
      return json({ updated })
    }
    const readMatch = url.match(/^\/api\/notificacoes\/(\d+)\/ler$/)
    if (readMatch && options.method === 'PATCH') {
      notifications = notifications.map((item) => item.id === Number(readMatch[1])
        ? { ...item, lida: true } : item)
      return json({ data: notifications.find((item) => item.id === Number(readMatch[1])) })
    }
    if (url === '/api/equipamentos/1') return json({ item: equipamento })
    if (url.startsWith('/api/equipamentos?')) {
      return json({ data: [equipamento], pagination: { page: 1, limit: 20, total: 1,
        totalPages: 1 }, sort: { sortBy: 'createdAt', order: 'desc' } })
    }
    return json({ error: 'ERRO_INTERNO' }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function openNotifications() {
  render(<App />)
  const button = await screen.findByRole('button', { name: /Notificações, 2 não lidas/ })
  fireEvent.click(button)
  await screen.findAllByText('Aviso do equipamento SN001.')
}

describe('Notificações internas', () => {
  it('carrega a contagem no início e exibe badge apenas quando há não lidas', async () => {
    render(<App />)
    const button = await screen.findByRole('button', { name: /Notificações, 2 não lidas/ })
    expect(button.textContent).toContain('2')
    notifications = notifications.map((item) => ({ ...item, lida: true }))
    fireEvent.click(button)
    await screen.findAllByText('Aviso do equipamento SN001.')
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Notificações, 0 não lidas/ }).textContent).not.toMatch(/0$/))
  })

  it('lista mensagens, datas, equipamento, status e estado de leitura', async () => {
    await openNotifications()
    expect(screen.getAllByText('Não lida')).toHaveLength(2)
    expect(screen.getAllByText(/Criada em 11\/09\/2026 às 09:00/)).toHaveLength(3)
    expect(screen.getAllByText(/Cliente Teste/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vencendo').length).toBeGreaterThan(0)
    expect(screen.getByText('OneCare vencido')).toBeTruthy()
  })

  it('filtra todas, lidas e não lidas reiniciando na primeira página', async () => {
    await openNotifications()
    fireEvent.click(screen.getByRole('button', { name: 'Lidas' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('lida=true'))).toBe(true))
    expect(screen.getAllByText('Lida')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Não lidas' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('lida=false'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) =>
      url.startsWith('/api/notificacoes?')).at(-1)[0]).not.toContain('lida='))
  })

  it('marca uma notificação como lida e atualiza a contagem', async () => {
    await openNotifications()
    fireEvent.click(screen.getAllByRole('button', { name: 'Marcar como lida' })[0])
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) =>
      url === '/api/notificacoes/1/ler' && options.method === 'PATCH')).toBe(true))
    await screen.findByRole('button', { name: /Notificações, 1 não lida/ })
  })

  it('marca todas como lidas e remove o badge numérico', async () => {
    await openNotifications()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }))
    await screen.findByRole('button', { name: /Notificações, 0 não lidas/ })
    expect(screen.queryByText('2')).toBeNull()
  })

  it('abre detalhes do equipamento ativo e não cria link quebrado para arquivado', async () => {
    await openNotifications()
    expect(screen.getByText('Equipamento arquivado')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Ver equipamento' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver equipamento' })[0])
    await screen.findByText('DETALHES DO EQUIPAMENTO')
    expect(screen.getByText('01/01/2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Voltar' }))
    await screen.findByText('Aviso do equipamento SN002.')
  })

  it('trata lista vazia, erro e atualização manual', async () => {
    notifications = []
    render(<App />)
    const button = await screen.findByRole('button', { name: /Notificações, 0 não lidas/ })
    fireEvent.click(button)
    expect(await screen.findByText('Nenhuma notificação encontrada')).toBeTruthy()
    fetchMock.mockRejectedValueOnce(new TypeError('segredo interno'))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('conectar ao servidor')
  })
})
