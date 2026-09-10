import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../src/App.jsx'
import ImportacaoExcel from '../src/components/ImportacaoExcel.jsx'
import { workbook } from '../../backend/test/helpers/excelFixture.js'

const xlsx = await workbook()
const testFile = (name = 'ficticia.xlsx') => new File([xlsx], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
const item = { serialNumber: 'EXCELTEST001', partNumber: 'MODELO TESTE', cliente: 'CLIENTE TESTE', distribuidor: 'DISTRIBUIDOR TESTE',
  contratoOnecare: 'CONTRATO TESTE', dataInicioOnecare: '2026-01-01', dataFimOnecare: '2027-01-01' }
const valid = { rowNumber: 2, status: 'VALID', data: item, errors: [] }
const invalid = { rowNumber: 3, status: 'INVALID', data: { ...item, serialNumber: 'INVALIDO002' },
  errors: [{ rowNumber: 3, field: 'distribuidor', code: 'CAMPO_OBRIGATORIO', value: null, message: 'Distribuidor obrigatório.' }] }
const preview = (rows = [valid]) => ({ summary: { totalRows: rows.length, validRows: rows.filter((r) => r.status === 'VALID').length,
  invalidRows: rows.filter((r) => r.status === 'INVALID').length, canImport: rows.every((r) => r.status === 'VALID') },
  warnings: [{ code: 'COLUNA_IGNORADA', message: 'Coluna ignorada: Extra.' }], rows })
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
let fetchMock
beforeEach(() => {
  fetchMock = vi.fn(async (url) => url.endsWith('/confirmar')
    ? response({ summary: { importedRows: 1 } }, 201) : response(preview()))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const select = (file = testFile()) => fireEvent.change(screen.getByLabelText('Planilha Excel'), { target: { files: [file] } })
const validated = () => screen.findByText('1 linha(s) · 1 válida(s) · 0 inválida(s)')

it('seleciona arquivo real fictício, envia FormData, mostra resumo, aviso e prévia', async () => {
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
  const file = testFile()
  select(file)
  expect(screen.getByText(/ficticia.xlsx ·/)).toBeTruthy()
  click('Validar planilha')
  await validated()
  expect(fetchMock.mock.calls[0][0]).toBe('/api/equipamentos/importacao/validar')
  const options = fetchMock.mock.calls[0][1]
  expect(options.body.get('arquivo')).toBe(file)
  expect(options.headers).toBeUndefined()
  expect(screen.getByText('Coluna ignorada: Extra.')).toBeTruthy()
  expect(screen.getByText('EXCELTEST001')).toBeTruthy()
  expect(screen.getByText('01/01/2026')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false)
})

it('trocar arquivo invalida a prévia e bloqueia a confirmação', async () => {
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  select(); click('Validar planilha'); await validated()
  select(testFile('outra-ficticia.xlsx'))
  expect(screen.queryByText('EXCELTEST001')).toBeNull()
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
  click('Trocar arquivo')
  expect(screen.getByRole('button', { name: 'Validar planilha' }).disabled).toBe(true)
})

it('filtra válidas/inválidas, mostra erros e bloqueia arquivo com erro', async () => {
  fetchMock.mockResolvedValue(response(preview([valid, invalid])))
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  select(); click('Validar planilha')
  await screen.findByText('2 linha(s) · 1 válida(s) · 1 inválida(s)')
  expect(screen.getByText(/Distribuidor obrigatório/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Filtrar prévia'), { target: { value: 'INVALID' } })
  expect(screen.queryByText('EXCELTEST001')).toBeNull()
  expect(screen.getByText('INVALIDO002')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Filtrar prévia'), { target: { value: 'VALID' } })
  expect(screen.getByText('EXCELTEST001')).toBeTruthy()
  expect(screen.queryByText('INVALIDO002')).toBeNull()
})

it('impede cliques repetidos e reenvia o mesmo arquivo na confirmação', async () => {
  let resolve
  fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const imported = vi.fn()
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={imported} />)
  const file = testFile()
  select(file); click('Validar planilha'); click('Validar planilha')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Planilha Excel').disabled).toBe(true)
  await act(async () => resolve(response(preview())))
  await validated()
  fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  click('Confirmar importação'); click('Confirmar importação')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][1].body.get('arquivo')).toBe(file)
  expect(screen.getByRole('button', { name: 'Cancelar importação' }).disabled).toBe(true)
  await act(async () => resolve(response({ summary: { importedRows: 1 } }, 201)))
  expect(imported).toHaveBeenCalledWith('1 equipamento(s) importado(s) com sucesso.')
  expect(screen.queryByText(/ficticia.xlsx ·/)).toBeNull()
})

it('erro de conexão é exibido sem habilitar confirmação', async () => {
  fetchMock.mockRejectedValue(new Error('falha privada'))
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  select(); click('Validar planilha')
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Não foi possível conectar')
  expect(alert.textContent).not.toContain('falha privada')
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
})

it('conflito na confirmação exige nova validação e mostra linhas', async () => {
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  select(); click('Validar planilha'); await validated()
  fetchMock.mockResolvedValueOnce(response({ error: 'IMPORTACAO_CONFLITO', details: invalid.errors }, 409))
  click('Confirmar importação')
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Nenhum equipamento foi importado')
  expect(alert.textContent).toContain('Linha 3')
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
})

it('rejeita extensão, arquivo vazio e tamanho excessivo no seletor', () => {
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  for (const file of [testFile('ficticia.csv'), new File([], 'vazia.xlsx'), new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.xlsx')]) {
    select(file)
    expect(screen.getByRole('alert').textContent).toContain('até 10 MB')
    expect(screen.getByRole('button', { name: 'Validar planilha' }).disabled).toBe(true)
  }
})

it('prévia pagina sem renderizar dez mil linhas ao mesmo tempo', async () => {
  fetchMock.mockResolvedValueOnce(response(preview(Array.from({ length: 51 }, (_, i) => ({ ...valid, rowNumber: i + 2 })))))
  render(<ImportacaoExcel onCancel={vi.fn()} onImported={vi.fn()} />)
  select(); click('Validar planilha')
  await screen.findByText('Página 1 de 2 · até 50 linhas por página')
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(51)
  click('Próxima na prévia')
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
})

it('integra ação na página e atualiza lista com mensagem de sucesso', async () => {
  const list = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
  fetchMock.mockImplementation(async (url) => url.endsWith('/validar') ? response(preview())
    : url.endsWith('/confirmar') ? response({ summary: { importedRows: 1 } }, 201) : response(list))
  render(<App />)
  await screen.findByText('Nenhum equipamento nesta página')
  click('Importar Excel'); select(); click('Validar planilha'); await validated(); click('Confirmar importação')
  await screen.findByText('1 equipamento(s) importado(s) com sucesso.')
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/equipamentos?'))).toHaveLength(2))
  click('Importar Excel')
  expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true)
  click('Cancelar importação')
  expect(screen.queryByLabelText('Planilha Excel')).toBeNull()
})
