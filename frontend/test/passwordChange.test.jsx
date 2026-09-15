import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from '../src/App.jsx'
import AlterarSenha from '../src/pages/AlterarSenha.jsx'
import { AuthContext } from '../src/auth/authState.js'

const admin = { id: 1, username: 'admin.fixture', role: 'ADMIN', ativo: true }
const viewer = { id: 2, username: 'viewer.fixture', role: 'VISUALIZADOR', ativo: true }
const original = 'Senha inicial ficticia!'
const next = ' Nova senha ficticia! '
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const emptyList = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, sort: { sortBy: 'createdAt', order: 'desc' } }

afterEach(() => vi.unstubAllGlobals())

function setup(handler = async () => response(null, 204)) {
  const fetch = vi.fn(async (url, options) => {
    if (url === '/api/auth/senha') return handler(options)
    if (url === '/api/auth/csrf') return response({ csrfToken: 'csrf-apos-troca' })
    if (url === '/api/notificacoes/nao-lidas/contagem') return response({ unreadCount: 0 })
    if (url === '/api/auth/login') return response({ user: admin, csrfToken: 'csrf-novo-login' })
    if (url === '/api/auth/logout') return response({ success: true })
    return response(emptyList)
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<App initialUser={admin} />)
  fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }))
  return { fetch, ...view }
}

function fill({ current = original, password = next, confirmation = password } = {}) {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmation } })
}

function inputs() {
  return ['Senha atual', 'Nova senha', 'Confirmar nova senha'].map((label) => screen.getByLabelText(label))
}

it('admin abre três campos vazios com tipo password e autocomplete apropriado', () => {
  setup()
  expect(screen.getByRole('heading', { name: 'Alterar minha senha' })).toBeTruthy()
  inputs().forEach((input, index) => {
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    expect(input.autocomplete).toBe(index === 0 ? 'current-password' : 'new-password')
  })
})

it.each([
  ['confirmação diferente', { confirmation: 'outra senha ficticia' }, 'A confirmação deve ser igual'],
  ['senha repetida', { password: original }, 'A nova senha deve ser diferente'],
  ['senha curta', { password: '1234567' }, '8 a 128'],
  ['senha longa', { password: 'x'.repeat(129) }, 'até 128'],
  ['somente espaços', { password: '        ' }, 'Preencha os três'],
  ['campo vazio', { current: '' }, 'Preencha os três'],
])('valida %s e limpa todos os campos sem enviar', (_label, values, message) => {
  const { fetch } = setup()
  fill(values)
  fireEvent.submit(screen.getByRole('form', { name: 'Alterar minha senha' }))
  expect(screen.getByRole('alert').textContent).toContain(message)
  inputs().forEach((input) => expect(input.value).toBe(''))
  expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/senha')).toHaveLength(0)
})

it('bloqueia envio duplicado, mantém senhas no body e limpa após erro da API', async () => {
  let release
  const { fetch } = setup(() => new Promise((resolve) => { release = resolve }))
  fill()
  const form = screen.getByRole('form', { name: 'Alterar minha senha' })
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(screen.getByRole('button', { name: 'Alterando…' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(true)
  expect(screen.getByText('Alterando senha…')).toBeTruthy()
  const calls = fetch.mock.calls.filter(([url]) => url === '/api/auth/senha')
  expect(calls).toHaveLength(1)
  expect(calls[0][1].method).toBe('PATCH')
  expect(calls[0][1].credentials).toBe('include')
  expect(calls[0][1].headers['x-csrf-token']).toBe('test-csrf-token')
  expect(JSON.parse(calls[0][1].body)).toEqual({ senhaAtual: original, novaSenha: next, confirmacaoNovaSenha: next })
  await act(async () => release(response({ error: 'SENHA_ATUAL_INCORRETA' }, 400)))
  expect(screen.getByRole('alert').textContent).toContain('A senha atual está incorreta.')
  inputs().forEach((input) => expect(input.value).toBe(''))
  expect(screen.getByRole('heading', { name: 'Alterar minha senha' })).toBeTruthy()
})

it('erro interno permanece genérico e permite tentar novamente com campos limpos', async () => {
  setup(async () => response({ error: 'ERRO_INTERNO', message: 'detalhe interno ficticio' }, 500))
  fill()
  fireEvent.submit(screen.getByRole('form', { name: 'Alterar minha senha' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível processar')
  expect(screen.queryByText('detalhe interno ficticio')).toBeNull()
  inputs().forEach((input) => expect(input.value).toBe(''))
})

it('cancelar e desmontar limpam os inputs inclusive referências antigas do DOM', () => {
  const { unmount } = setup()
  fill()
  const previous = inputs()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  previous.forEach((input) => expect(input.value).toBe(''))
  fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }))
  inputs().forEach((input) => expect(input.value).toBe(''))
  fill()
  const mounted = inputs()
  unmount()
  mounted.forEach((input) => expect(input.value).toBe(''))
})

it('204 limpa formulário, retorna ao login e renova CSRF para login e logout', async () => {
  const { fetch } = setup()
  fill()
  const previous = inputs()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar alteração' }))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Todas as sessões foram encerradas')
  previous.forEach((input) => expect(input.value).toBe(''))
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: admin.username } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: next } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await screen.findByText('admin.fixture · Administrador')
  const login = fetch.mock.calls.find(([url]) => url === '/api/auth/login')
  expect(login[1].headers['x-csrf-token']).toBe('csrf-apos-troca')
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
  await screen.findByRole('heading', { name: 'Entrar' })
  expect(fetch.mock.calls.find(([url]) => url === '/api/auth/logout')[1].headers['x-csrf-token']).toBe('csrf-novo-login')
})

it('visualizador não vê atalho nem acessa formulário montado diretamente', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(emptyList)))
  const { unmount } = render(<App initialUser={viewer} />)
  await screen.findByText('viewer.fixture · Visualizador')
  expect(screen.queryByRole('button', { name: 'Alterar minha senha' })).toBeNull()
  unmount()
  const changeOwnPassword = vi.fn()
  render(<AuthContext.Provider value={{ user: viewer, changeOwnPassword }}><AlterarSenha onCancel={() => {}} /></AuthContext.Provider>)
  expect(screen.getByRole('alert').textContent).toContain('não tem permissão')
  expect(screen.queryByLabelText('Senha atual')).toBeNull()
  expect(changeOwnPassword).not.toHaveBeenCalled()
})

it('401 na troca retorna ao login por sessão inválida', async () => {
  setup(async () => response({ error: 'NAO_AUTENTICADO' }, 401))
  fill()
  fireEvent.submit(screen.getByRole('form', { name: 'Alterar minha senha' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Entrar' })).toBeTruthy())
})
