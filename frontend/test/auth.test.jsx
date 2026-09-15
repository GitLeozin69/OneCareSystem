import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from '../src/App.jsx'

const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const admin = { id: 1, username: 'admin.onecare', role: 'ADMIN', ativo: true }
const viewer = { id: 2, username: 'consulta', role: 'VISUALIZADOR', ativo: true }
const emptyList = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, sort: { sortBy: 'createdAt', order: 'desc' } }

afterEach(() => vi.unstubAllGlobals())

it('restaura a sessão por /auth/me sem exibir conteúdo protegido antes da resposta', async () => {
  let release
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url === '/api/auth/me') return new Promise((resolve) => { release = () => resolve(response({ user: admin, csrfToken: 'csrf' })) })
    if (url === '/api/notificacoes/nao-lidas/contagem') return Promise.resolve(response({ unreadCount: 0 }))
    return Promise.resolve(response(emptyList))
  }))
  render(<App />)
  expect(screen.getByText('Verificando sessão…')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Equipamentos' })).toBeNull()
  release()
  expect(await screen.findByText('admin.onecare · Administrador')).toBeTruthy()
})

it('faz login com cookie, CSRF em memória e mensagem genérica para credenciais inválidas', async () => {
  const fetchMock = vi.fn(async (url) => {
    if (url === '/api/auth/me') return response({ error: 'NAO_AUTENTICADO' }, 401)
    if (url === '/api/auth/csrf') return response({ csrfToken: 'csrf-login' })
    if (url === '/api/auth/login') return response({ error: 'CREDENCIAIS_INVALIDAS' }, 401)
    return response(emptyList)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.change(await screen.findByLabelText('Usuário'), { target: { value: 'inexistente' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha incorreta' } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Usuário ou senha inválidos.')
  expect(screen.getByLabelText('Senha').value).toBe('')
  const [, options] = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login')
  expect(options.credentials).toBe('include')
  expect(options.headers['x-csrf-token']).toBe('csrf-login')
})

it('visualizador acessa consultas, mas não vê escrita, importação, notificações ou usuários', async () => {
  const fetchMock = vi.fn(async () => response(emptyList))
  vi.stubGlobal('fetch', fetchMock)
  render(<App initialUser={viewer} />)
  await screen.findByText('Nenhum equipamento nesta página')
  expect(screen.getByText('consulta · Visualizador')).toBeTruthy()
  for (const label of ['Novo equipamento', 'Importar Excel', 'Notificações', 'Usuários']) {
    expect(screen.queryByRole('button', { name: label })).toBeNull()
  }
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/notificacoes'))).toBe(false)
})

it('administrador acessa gestão de usuários e a redefinição usa campo de senha', async () => {
  const users = [{ ...admin }, { ...viewer }]
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/notificacoes/nao-lidas/contagem') return response({ unreadCount: 0 })
    if (url === '/api/usuarios') return response({ data: users })
    return response(emptyList)
  }))
  render(<App initialUser={admin} />)
  fireEvent.click(screen.getByRole('button', { name: 'Usuários' }))
  expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy()
  expect(screen.getByText('consulta')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  const passwordInput = screen.getByLabelText('Nova senha')
  expect(passwordInput.type).toBe('password')
  expect(screen.queryByText(/senha anterior/i)).toBeNull()
})

it('exibe a nova logo e o cabeçalho verde para usuário autenticado', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/notificacoes/nao-lidas/contagem') return response({ unreadCount: 0 })
    return response(emptyList)
  }))
  render(<App initialUser={admin} />)
  await screen.findByText('Nenhum equipamento nesta página')
  const logo = screen.getByRole('img', { name: 'Inteligência em Negócios' })
  expect(logo.getAttribute('src')).toBe('/logo-onecare.png')
  expect(logo.closest('header').className).toContain('bg-[#33534c]')
})

it('401 em consulta encerra o estado autenticado e informa sessão expirada', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'NAO_AUTENTICADO' }, 401)))
  render(<App initialUser={viewer} />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Entrar' })).toBeTruthy())
  expect(screen.getByText('Sua sessão expirou. Entre novamente.')).toBeTruthy()
})
