import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OneCareApp from '../src/App.jsx'
import { formatDate, prepareEquipment, toFormValues } from '../src/utils/equipamento.js'

const App = () => <OneCareApp initialUser={{ id: 1, username: 'admin', role: 'ADMIN', ativo: true }} />

const item = {
  id: 1, serialNumber: 'SN001', partNumber: 'PN / 01', cliente: 'Cliente Teste',
  distribuidor: 'Distribuidor Teste', patrimonio: 'PAT-01', notaFiscal: 'NF-001',
  contratoOnecare: 'OC / 01', dataInicioOnecare: '2025-01-01',
  dataFimOnecare: '2025-12-31', dataUltimaConferencia: '2025-09-01',
  createdAt: '2025-01-01T12:00:00Z', updatedAt: '2025-01-01T12:00:00Z', arquivado: false,
}
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const list = (data = [item], page = 1, total = data.length) => ({
  data, pagination: { page, limit: 20, total, totalPages: Math.ceil(total / 20) },
  sort: { sortBy: 'createdAt', order: 'desc' },
})
let fetchMock
beforeEach(() => {
  fetchMock = vi.fn(async (url, options) => {
    if (options?.method === 'POST' || options?.method === 'PATCH') return json({ item })
    if (url === '/api/equipamentos/1') return json({ item })
    const page = Number(new URL(url, 'http://local').searchParams.get('page') ?? 1)
    return json(list([item], page))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const input = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const ready = () => screen.findByRole('button', { name: 'Editar SN001' })
const lastParams = () => new URL(fetchMock.mock.calls.filter(([url]) =>
  url.startsWith('/api/equipamentos?')).at(-1)[0], 'http://local').searchParams
const writes = () => fetchMock.mock.calls.filter(([, options]) => ['POST', 'PATCH'].includes(options?.method))
async function newForm() {
  render(<App />)
  await ready()
  click('Novo equipamento')
}
function fillRequired() {
  input('Número de série *', 'ab123')
  input('Part number *', ' PN / 01 ')
  input('Cliente *', ' Cliente Teste ')
  input('Distribuidor *', ' Distribuidor Teste ')
  input('Início do OneCare *', '2026-01-01')
  input('Término do OneCare *', '2026-12-31')
}

describe('Listagem integrada', () => {
  it('carrega equipamentos e mostra datas, inclusive cobertura vencida', async () => {
    render(<App />)
    expect(screen.getByText('Carregando equipamentos…')).toBeTruthy()
    await ready()
    expect(screen.getByText('31/12/2025')).toBeTruthy()
    expect(screen.getByText('Cliente Teste')).toBeTruthy()
    expect(screen.getByText('Distribuidor Teste')).toBeTruthy()
    expect(screen.getByText('NF-001')).toBeTruthy()
    expect(Object.fromEntries(lastParams())).toEqual({ page: '1', limit: '20', sortBy: 'createdAt', order: 'desc' })
  })

  it('distingue lista vazia de pesquisa sem resultados e desabilita navegação', async () => {
    fetchMock.mockResolvedValue(json(list([])))
    render(<App />)
    await screen.findByText('Nenhum equipamento nesta página')
    expect(screen.getByRole('button', { name: '← Anterior' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Próxima →' }).disabled).toBe(true)
    input('Pesquisar equipamentos', 'ausente')
    fireEvent.submit(screen.getByRole('search'))
    await screen.findByText('Nenhum resultado encontrado')
    click('Limpar')
    await screen.findByText('Nenhum equipamento nesta página')
    expect(lastParams().has('q')).toBe(false)
  })

  it('mostra traço nos opcionais ausentes', async () => {
    fetchMock.mockResolvedValue(json(list([{
      ...item, patrimonio: null, notaFiscal: null, contratoOnecare: null,
    }])))
    render(<App />)
    await ready()
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('permite tentar novamente após erro de rede', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('detalhe interno'))
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toContain('conectar ao servidor')
    click('Tentar novamente')
    await ready()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('envia página, pesquisa e ordenação para o servidor e reinicia página', async () => {
    fetchMock.mockImplementation(async (url) => json(list([item], Number(new URL(url, 'http://local').searchParams.get('page')), 45)))
    render(<App />)
    await ready()
    click('Próxima →')
    await screen.findByText('45 equipamento(s) · Página 2 de 3')
    input('Pesquisar equipamentos', '  Cliente  ')
    click('Pesquisar')
    await waitFor(() => expect(lastParams().get('q')).toBe('Cliente'))
    expect(lastParams().get('page')).toBe('1')
    await ready()
    input('Ordenar por', 'cliente')
    await waitFor(() => expect(lastParams().get('sortBy')).toBe('cliente'))
    input('Direção', 'asc')
    await waitFor(() => expect(lastParams().get('order')).toBe('asc'))
    input('Por página', '50')
    await waitFor(() => expect(lastParams().get('limit')).toBe('50'))
    expect(lastParams().get('page')).toBe('1')
  })

  it('pesquisa e oferece ordenação por nota fiscal e distribuidor', async () => {
    render(<App />)
    await ready()
    input('Pesquisar equipamentos', '  NF-001  ')
    click('Pesquisar')
    await waitFor(() => expect(lastParams().get('q')).toBe('NF-001'))
    input('Ordenar por', 'notaFiscal')
    await waitFor(() => expect(lastParams().get('sortBy')).toBe('notaFiscal'))
    input('Ordenar por', 'distribuidor')
    await waitFor(() => expect(lastParams().get('sortBy')).toBe('distribuidor'))
  })

  it('não permite que resposta antiga substitua a pesquisa mais recente', async () => {
    let resolveOld
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    render(<App />)
    input('Pesquisar equipamentos', 'recente')
    click('Pesquisar')
    await ready()
    await act(async () => resolveOld(json(list([{ ...item, serialNumber: 'ANTIGO' }]))))
    expect(screen.queryByText('ANTIGO')).toBeNull()
    expect(screen.getByText('SN001')).toBeTruthy()
  })
})

describe('Cadastro e edição', () => {
  it('cadastra somente campos públicos, normaliza serial e atualiza listagem', async () => {
    await newForm()
    fillRequired()
    expect(screen.getByLabelText('Número de série *').value).toBe('AB123')
    click('Salvar equipamento')
    await screen.findByText('Equipamento cadastrado com sucesso.')
    await ready()
    expect(writes()).toHaveLength(1)
    expect(writes()[0][0]).toBe('/api/equipamentos')
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      serialNumber: 'AB123', partNumber: 'PN / 01', cliente: 'Cliente Teste',
      distribuidor: 'Distribuidor Teste', patrimonio: null, notaFiscal: null,
      contratoOnecare: null, dataInicioOnecare: '2026-01-01',
      dataFimOnecare: '2026-12-31', dataUltimaConferencia: null,
    })
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('?'))).toHaveLength(2)
  })

  it('renderiza os novos campos e envia valores normalizados no cadastro', async () => {
    await newForm()
    expect(screen.getByLabelText('Distribuidor *').required).toBe(true)
    expect(screen.getByLabelText('Nota fiscal (opcional)').required).toBe(false)
    fillRequired()
    input('Distribuidor *', '  Distribuidor Misto Ltda.  ')
    input('Nota fiscal (opcional)', '  Nf / 2026-a  ')
    click('Salvar equipamento')
    await screen.findByText('Equipamento cadastrado com sucesso.')
    const payload = JSON.parse(writes()[0][1].body)
    expect(payload.distribuidor).toBe('Distribuidor Misto Ltda.')
    expect(payload.notaFiscal).toBe('Nf / 2026-a')
  })

  it('carrega edição por ID, limpa opcionais e preserva pesquisa/ordenação', async () => {
    render(<App />)
    await ready()
    input('Pesquisar equipamentos', 'Teste')
    click('Pesquisar')
    await ready()
    input('Ordenar por', 'cliente')
    await ready()
    click('Editar SN001')
    await waitFor(() => expect(screen.getByLabelText('Cliente *').value).toBe(item.cliente))
    expect(screen.getByLabelText('Distribuidor *').value).toBe('Distribuidor Teste')
    expect(screen.getByLabelText('Nota fiscal (opcional)').value).toBe('NF-001')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/equipamentos/1')).toBe(true)
    input('Cliente *', 'Cliente Atualizado')
    input('Distribuidor *', '  Distribuidor Atualizado  ')
    input('Patrimônio (opcional)', '  ')
    input('Nota fiscal (opcional)', '  ')
    input('Contrato OneCare (opcional)', '')
    input('Última conferência (opcional)', '')
    click('Salvar equipamento')
    await screen.findByText('Equipamento atualizado com sucesso.')
    await ready()
    const [url, options] = writes()[0]
    expect(url).toBe('/api/equipamentos/1')
    expect(options.method).toBe('PATCH')
    const payload = JSON.parse(options.body)
    expect(payload).toMatchObject({ cliente: 'Cliente Atualizado', distribuidor: 'Distribuidor Atualizado', patrimonio: null, notaFiscal: null, contratoOnecare: null, dataUltimaConferencia: null, dataInicioOnecare: '2025-01-01' })
    expect(Object.keys(payload)).toHaveLength(10)
    expect(lastParams().get('q')).toBe('Teste')
    expect(lastParams().get('sortBy')).toBe('cliente')
  })

  it('valida campos obrigatórios, serial e intervalo sem enviar requisição', async () => {
    await newForm()
    click('Salvar equipamento')
    expect(screen.getAllByText('Este campo é obrigatório.')).toHaveLength(6)
    expect(screen.getByLabelText('Distribuidor *').getAttribute('aria-invalid')).toBe('true')
    fillRequired()
    input('Número de série *', 'ab-123')
    input('Término do OneCare *', '2025-01-01')
    click('Salvar equipamento')
    expect(screen.getByText(/Use somente letras/)).toBeTruthy()
    expect(screen.getByText('O término não pode ser anterior ao início do OneCare.')).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it.each([
    ['SERIAL_DUPLICADO', 'Número de série *', 'Já existe um equipamento com esse número de série.'],
    ['PATRIMONIO_DUPLICADO', 'Patrimônio (opcional)', 'Já existe um equipamento com esse patrimônio.'],
    ['DATA_INVALIDA', 'Início do OneCare *', 'Informe uma data válida.'],
    ['CAMPO_OBRIGATORIO', 'Distribuidor *', 'Preencha os campos obrigatórios.'],
  ])('mostra erro %s no campo e mantém dados digitados', async (code, label, message) => {
    await newForm()
    fillRequired()
    const details = code === 'DATA_INVALIDA'
      ? [{ field: 'dataInicioOnecare' }]
      : code === 'CAMPO_OBRIGATORIO' ? [{ field: 'distribuidor' }] : []
    const status = code === 'DATA_INVALIDA' ? 422 : code === 'CAMPO_OBRIGATORIO' ? 400 : 409
    fetchMock.mockResolvedValueOnce(json({ error: code, details }, status))
    click('Salvar equipamento')
    await screen.findByRole('alert')
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByText(message).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Cliente *').value).toBe(' Cliente Teste ')
    expect(screen.getByLabelText('Distribuidor *').value).toBe(' Distribuidor Teste ')
  })

  it('bloqueia clique e submit repetidos durante salvamento', async () => {
    await newForm()
    fillRequired()
    let resolveSave
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const form = screen.getByRole('form', { name: 'Novo equipamento' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(writes()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Salvando…' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(true)
    await act(async () => resolveSave(json({ item })))
    await screen.findByText('Equipamento cadastrado com sucesso.')
  })

  it('informa equipamento não encontrado na edição e permite voltar', async () => {
    render(<App />)
    await ready()
    fetchMock.mockResolvedValueOnce(json({ error: 'EQUIPAMENTO_NAO_ENCONTRADO' }, 404))
    click('Editar SN001')
    expect((await screen.findByRole('alert')).textContent).toContain('não encontrado')
    expect(screen.queryByRole('button', { name: 'Salvar equipamento' })).toBeNull()
    click('← Voltar para equipamentos')
    await ready()
  })

  it('preserva filtro ao cancelar e não salva', async () => {
    render(<App />)
    await ready()
    input('Pesquisar equipamentos', 'Teste')
    click('Pesquisar')
    await ready()
    click('Novo equipamento')
    click('Cancelar')
    await ready()
    expect(lastParams().get('q')).toBe('Teste')
    expect(writes()).toHaveLength(0)
  })

  it('não mostra detalhes internos de falhas do servidor', async () => {
    await newForm()
    fillRequired()
    fetchMock.mockResolvedValueOnce(json({ error: 'ERRO_INTERNO', message: 'senha-secreta Prisma MySQL', details: [{ field: 'cliente', message: 'senha-secreta' }] }, 500))
    click('Salvar equipamento')
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível processar a solicitação. Tente novamente.')
    expect(screen.queryByText(/senha-secreta/)).toBeNull()
  })

  it('informa conflito de atualização sem expor resposta interna nem perder formulário', async () => {
    render(<App />)
    await ready()
    click('Editar SN001')
    await screen.findByDisplayValue('Cliente Teste')
    fetchMock.mockResolvedValueOnce(json({ error: 'CONFLITO_ATUALIZACAO', message: 'detalhe privado' }, 409))
    click('Salvar equipamento')
    expect((await screen.findByRole('alert')).textContent).toContain('Atualize os dados e tente novamente')
    expect(screen.getByLabelText('Cliente *').value).toBe('Cliente Teste')
    expect(screen.queryByText('detalhe privado')).toBeNull()
  })

  it('conteúdo HTML armazenado é exibido como texto sem criar elementos executáveis', async () => {
    const marker = '<img src=x onerror="window.auditExecuted=true">'
    fetchMock.mockResolvedValue(json(list([{ ...item, cliente: marker }])))
    const { container } = render(<App />)
    await ready()
    expect(screen.getByText(marker)).toBeTruthy()
    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(window.auditExecuted).toBeUndefined()
  })
})

describe('Datas e payload', () => {
  it('formata dias civis sem conversão de fuso', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2024-02-29')).toBe('29/02/2024')
    expect(formatDate(null)).toBe('—')
  })
  it('rejeita datas inexistentes e não restringe formatos de outros textos', () => {
    const { payload, errors } = prepareEquipment(toFormValues({ ...item, dataInicioOnecare: '2026-02-30', dataFimOnecare: '2026-12-31' }))
    expect(errors.dataInicioOnecare).toBe('Informe uma data válida.')
    expect(payload.partNumber).toBe('PN / 01')
    expect(payload.contratoOnecare).toBe('OC / 01')
  })
})
