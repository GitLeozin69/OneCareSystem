import assert from 'node:assert/strict'
import test from 'node:test'
import writeExcelFile from 'write-excel-file/node'
import { zipSync, unzipSync } from 'fflate'
import { buildApp } from '../src/app.js'
import { createImportacaoService } from '../src/services/importacaoService.js'
import { readWorkbook, decimalText } from '../src/utils/excelWorkbook.js'
import { createEquipamentoService } from '../src/services/equipamentoService.js'
import { createFakePrisma } from './helpers/fakePrisma.js'
import { workbook, headers, exampleRow, alterXml, importFake, multipartPayload } from './helpers/excelFixture.js'

const file = (buffer, filename = 'ficticia.xlsx') => ({ buffer, filename })
function setup() {
  const fake = importFake()
  return { ...fake, service: createImportacaoService({ prisma: fake.prisma }) }
}

test('mapeamento Zebra, espaços duplicados, opcionais null, datas e prévia sem escrita', async () => {
  const { service, state } = setup()
  const preview = await service.validate(file(await workbook()))
  assert.deepEqual(preview.summary, { totalRows: 1, validRows: 1, invalidRows: 0, canImport: true })
  assert.deepEqual(preview.rows[0].data, {
    contratoOnecare: 'CONTRATO-FICTICIO-A', distribuidor: 'DISTRIBUIDOR TESTE', cliente: 'CLIENTE TESTE',
    dataInicioOnecare: '2026-01-01', dataFimOnecare: '2027-01-01', partNumber: 'MODELO-TESTE', serialNumber: 'EXCELTEST001',
    patrimonio: null, notaFiscal: null, dataUltimaConferencia: null,
  })
  assert.equal(preview.warnings.length, 0)
  assert.equal(state.writes, 0)
  assert.equal(state.transactions, 0)
})

test('confirma todos os equipamentos, mantém contratos por linha e ignora filename e Quantity', async () => {
  const { service, state } = setup()
  const rows = [exampleRow('a001'), exampleRow('b002')]
  rows[1][0] = 'CONTRATO-FICTICIO-B'
  const result = await service.confirm(file(await workbook(rows), 'cliente-contrato-produto-ficticios.xlsx'))
  assert.equal(result.summary.importedRows, 2)
  assert.equal(state.items.length, 2)
  assert.equal(state.items[0].serialNumber, 'A001')
  assert.equal(state.items[1].contratoOnecare, 'CONTRATO-FICTICIO-B')
  assert.equal(state.transactions, 1)
  assert.ok(state.items[0].dataInicioOnecare instanceof Date)
  assert.ok(!('historicoContrato' in state.items[0]))
  assert.ok(!('notificacoes' in state.items[0]))
})

test('normaliza cabeçalhos e avisa sobre desconhecidos; conhecidos ignorados', async () => {
  const { service } = setup()
  const preview = await service.validate(file(await workbook([[...exampleRow(), 'ignorar']],
    [...headers.map((h) => '  ' + h.toUpperCase() + '  '), 'Coluna futura'])))
  assert.equal(preview.summary.canImport, true)
  assert.equal(preview.warnings.length, 1)
  assert.equal(preview.warnings[0].code, 'COLUNA_IGNORADA')
})

test('contrato é opcional, inclusive a coluna', async () => {
  const { service } = setup()
  const result = await service.validate(file(await workbook([exampleRow().slice(1)], headers.slice(1))))
  assert.equal(result.rows[0].data.contratoOnecare, null)
  assert.equal(result.summary.canImport, true)
})

for (const [name, index, value, code] of [
  ['distribuidor vazio', 2, '   ', 'CAMPO_OBRIGATORIO'],
  ['serial especial', 8, 'ABC-01', 'SERIAL_INVALIDO'],
  ['serial booleano', 8, true, 'CAMPO_OBRIGATORIO'],
  ['data inexistente', 5, '31/02/2026', 'DATA_INVALIDA'],
  ['data ambígua', 5, '1/2/26', 'DATA_INVALIDA'],
  ['data final anterior', 6, '2025-01-01', 'INTERVALO_DATAS_INVALIDO'],
  ['limite distribuidor', 2, 'D'.repeat(256), 'CAMPO_MUITO_LONGO'],
]) test(`validação reutilizada: ${name}`, async () => {
  const { service, state } = setup()
  const row = exampleRow()
  row[index] = value
  const buffer = await workbook([row])
  const preview = await service.validate(file(buffer))
  assert.equal(preview.summary.canImport, false)
  assert.ok(preview.rows[0].errors.some((error) => error.code === code))
  await assert.rejects(service.confirm(file(buffer)), { code: 'IMPORTACAO_INVALIDA' })
  assert.equal(state.items.length, 0)
})

test('datas Excel e ISO não mudam de dia; serial numérico e zeros textuais são preservados', async () => {
  const { service } = setup()
  const rows = [exampleRow(123456789012345), exampleRow('000123')]
  rows[0][5] = new Date('2026-01-01T00:00:00Z')
  rows[0][6] = new Date('2026-12-31T00:00:00Z')
  const preview = await service.validate(file(await workbook(rows)))
  assert.equal(preview.summary.canImport, true)
  assert.equal(preview.rows[0].data.serialNumber, '123456789012345')
  assert.equal(preview.rows[1].data.serialNumber, '000123')
  assert.equal(preview.rows[0].data.dataInicioOnecare, '2026-01-01')
  assert.equal(preview.rows[0].data.dataFimOnecare, '2026-12-31')
  assert.equal(decimalText('1.234567890123456789e19'), '12345678901234567890')
})

test('duplicidades internas bloqueiam todas as ocorrências e informam linhas', async () => {
  const { service } = setup()
  const preview = await service.validate(file(await workbook([exampleRow('dup1'), exampleRow(' DUP1 ')])))
  assert.equal(preview.summary.invalidRows, 2)
  assert.deepEqual(preview.rows[0].errors[0].conflictingRows, [3])
  assert.deepEqual(preview.rows[1].errors[0].conflictingRows, [2])
})

for (const arquivado of [false, true]) test(`serial existente é bloqueado, arquivado=${arquivado}`, async () => {
  const fake = importFake([{ serialNumber: 'EXCELTEST001', arquivado }])
  const service = createImportacaoService({ prisma: fake.prisma })
  const preview = await service.validate(file(await workbook()))
  assert.equal(preview.rows[0].errors[0].code, 'SERIAL_DUPLICADO')
  assert.equal(fake.state.queries, 1)
  assert.equal(fake.state.writes, 0)
})

test('confirmação revalida conflitos criados depois da prévia', async () => {
  const { service, state } = setup()
  const buffer = await workbook()
  assert.equal((await service.validate(file(buffer))).summary.canImport, true)
  state.items.push({ serialNumber: 'EXCELTEST001' })
  await assert.rejects(service.confirm(file(buffer)), { code: 'IMPORTACAO_INVALIDA' })
  assert.equal(state.writes, 0)
})

test('conflito durante transação retorna 409 e não mantém inserções', async () => {
  const { service, state } = setup()
  state.race = { serialNumber: 'EXCELTEST001' }
  await assert.rejects(service.confirm(file(await workbook())), (error) => {
    assert.equal(error.statusCode, 409)
    assert.equal(error.details[0].field, 'serialNumber')
    return true
  })
  assert.equal(state.items.length, 1)
})

test('falha no segundo lote reverte o primeiro; consultas são em lote', async () => {
  const { service, state } = setup()
  state.failBatch = 2
  await assert.rejects(service.confirm(file(await workbook(Array.from({ length: 501 }, (_, i) => exampleRow('BATCH' + i))))),
    { code: 'IMPORTACAO_CONFLITO' })
  assert.equal(state.items.length, 0)
  assert.equal(state.writes, 2)
  assert.equal(state.queries, 4)
})

test('linhas vazias são ignoradas sem perder número original', async () => {
  const { service } = setup()
  const preview = await service.validate(file(await workbook([[], exampleRow()])))
  assert.equal(preview.summary.totalRows, 1)
  assert.equal(preview.rows[0].rowNumber, 3)
})

test('rejeita cabeçalhos ausentes ou duplicados', async () => {
  const { service } = setup()
  for (const titles of [headers.filter((h) => h !== 'Distributor Name'), [...headers, ' Serial # ']]) {
    await assert.rejects(service.validate(file(await workbook([exampleRow()], titles))), { code: 'CABECALHO_INVALIDO' })
  }
})

test('rejeita arquivo vazio, corrompido, extensão inválida e somente cabeçalho', async () => {
  const { service } = setup()
  for (const input of [file(Buffer.alloc(0)), file(Buffer.from('corrompido')), file(await workbook(), 'ficticio.xls'), file(await workbook([]))]) {
    await assert.rejects(service.validate(input))
  }
})

test('limites reais de 10 MB e 10.000 linhas', async () => {
  const { service } = setup()
  await assert.rejects(service.validate(file(Buffer.alloc(10 * 1024 * 1024 + 1))), { code: 'LIMITE_ARQUIVO' })
  const buffer = await workbook(Array.from({ length: 10001 }, (_, i) => exampleRow('LIMIT' + i)))
  await assert.rejects(service.validate(file(buffer)))
})

test('fórmula importada é rejeitada mesmo com valor cacheado; proteção é rejeitada', async () => {
  const { service } = setup()
  const base = await workbook()
  const formula = alterXml(base, 'xl/worksheets/sheet1.xml', (xml) => xml.replace(/(<c\b[^>]*\br="I2"[^>]*>)/, '$1<f>1+1</f>'))
  const preview = await service.validate(file(formula))
  assert.ok(preview.rows[0].errors.some((e) => e.code === 'FORMULA_NAO_PERMITIDA'))
  const protectedFile = alterXml(base, 'xl/worksheets/sheet1.xml', (xml) => xml.replace('</worksheet>', '<sheetProtection sheet="1"/></worksheet>'))
  await assert.rejects(service.validate(file(protectedFile)), { code: 'ARQUIVO_INVALIDO' })
})

test('DTD e dimensão artificial são rejeitados antes da leitura', async () => {
  const base = await workbook()
  for (const transform of [
    (xml) => xml.replace('<worksheet', '<!DOCTYPE worksheet [<!ENTITY bad "bad">]><worksheet'),
    (xml) => xml.replace('<sheetData>', '<dimension ref="A1:XFD1048576"/><sheetData>'),
  ]) await assert.rejects(readWorkbook(alterXml(base, 'xl/worksheets/sheet1.xml', transform), 10000))
})

test('HTTP multipart validar/confirmar, limites, arquivo único e rotas anteriores', async (context) => {
  const { service } = setup()
  const app = buildApp({ importacaoService: service,
    equipamentoService: createEquipamentoService({ prisma: createFakePrisma().prisma }) })
  context.after(() => app.close())
  const buffer = await workbook()
  const send = (path, options = {}) => app.inject({ method: 'POST', url: '/equipamentos/importacao/' + path,
    ...multipartPayload(buffer, options) })
  assert.equal((await send('validar')).statusCode, 200)
  assert.equal((await send('confirmar')).statusCode, 201)
  assert.equal((await send('validar', { field: 'errado' })).statusCode, 400)
  assert.equal((await send('validar', { filename: 'teste.csv' })).statusCode, 415)
  assert.equal((await app.inject({ method: 'POST', url: '/equipamentos/importacao/validar', payload: {} })).statusCode, 415)
  assert.equal((await app.inject({ method: 'GET', url: '/equipamentos' })).statusCode, 200)
  const extra = '--ONECARETESTBOUNDARY\r\nContent-Disposition: form-data; name="arquivo"; filename="segundo.xlsx"\r\n\r\nteste\r\n'
  assert.equal((await send('validar', { extra })).statusCode, 400)
  const oversized = await app.inject({ method: 'POST', url: '/equipamentos/importacao/validar',
    ...multipartPayload(Buffer.alloc(10 * 1024 * 1024 + 1)) })
  assert.equal(oversized.statusCode, 413)
})

test('usa somente a primeira aba, ignora fórmulas em colunas não importadas', async () => {
  const { service } = setup()
  const buffer = await writeExcelFile([
    { sheet: 'Primeira', data: [headers, exampleRow()] },
    { sheet: 'Segunda', data: [['cabecalho irrelevante'], ['dados ficticios ignorados']] },
  ]).toBuffer()
  assert.equal((await service.validate(file(buffer))).summary.totalRows, 1)
  const formulaIgnored = alterXml(buffer, 'xl/worksheets/sheet1.xml', (xml) => xml.replace(/(<c\b[^>]*\br="J2"[^>]*>)/, '$1<f>1+1</f>'))
  assert.equal((await service.validate(file(formulaIgnored))).summary.canImport, true)
})

test('datas reais Excel respeitam época 1904 e rejeitam dia fictício da época 1900', async () => {
  const { service } = setup()
  const row = exampleRow()
  row[5] = new Date('2026-01-01T00:00:00Z')
  const base = await workbook([row])
  const day60 = alterXml(base, 'xl/worksheets/sheet1.xml', (xml) => xml.replace(/(<c\b[^>]*\br="F2"[^>]*>\s*<v>)[^<]+/, '$160'))
  const bad = await service.validate(file(day60))
  assert.equal(bad.summary.canImport, false)
  assert.equal(bad.rows[0].errors[0].code, 'DATA_INVALIDA')
  const epoch = alterXml(base, 'xl/workbook.xml', (xml) => xml.replace('<workbookPr/>', '<workbookPr date1904="true"/>'))
  const date1904 = alterXml(epoch, 'xl/worksheets/sheet1.xml', (xml) => xml.replace(/(<c\b[^>]*\br="F2"[^>]*>\s*<v>)([^<]+)/,
    (_, before, value) => before + (Number(value) - 1462)))
  assert.equal((await service.validate(file(date1904))).rows[0].data.dataInicioOnecare, '2026-01-01')
})

test('cabeçalho deve estar na primeira linha', async () => {
  const { service } = setup()
  await assert.rejects(service.validate(file(await workbook([headers, exampleRow()], []))), { code: 'CABECALHO_INVALIDO' })
})

test('10.000 linhas válidas e 10.000 duplicadas têm processamento e resposta limitados', async () => {
  const { service, state } = setup()
  const input = file(await workbook([[], ...Array.from({ length: 10000 }, (_, index) => exampleRow('LOAD' + index))]))
  const result = await service.validate(input)
  assert.equal(result.summary.validRows, 10000)
  assert.equal(state.queries, 20)
  assert.equal(state.writes, 0)
  const repeated = await service.validate(file(await workbook(Array.from({ length: 10000 }, () => exampleRow('REPETIDO')))))
  assert.equal(repeated.summary.invalidRows, 10000)
  assert.equal(repeated.rows[0].errors[0].conflictingRows.length, 50)
  assert.equal(repeated.rows[0].errors[0].conflictingRowCount, 9999)
  assert.equal(repeated.rows[0].errors[0].conflictingRowsTruncated, true)
})

test('rejeita macros e ZIP excessivamente expandido', async () => {
  const { service } = setup()
  const files = unzipSync(await workbook())
  files['xl/vbaProject.bin'] = new Uint8Array([0])
  await assert.rejects(service.validate(file(Buffer.from(zipSync(files)))), { code: 'ARQUIVO_INVALIDO' })
  delete files['xl/vbaProject.bin']
  files['large.xml'] = new Uint8Array(21 * 1024 * 1024)
  await assert.rejects(service.validate(file(Buffer.from(zipSync(files)))), { code: 'ARQUIVO_INVALIDO' })
})

test('erros internos não expõem conteúdo e limite de concorrência retorna 429', async (context) => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const app = buildApp({ importacaoService: { async validate() { await pending; throw new Error('DADO FICTICIO PRIVADO') } } })
  context.after(() => app.close())
  const buffer = await workbook()
  const send = () => app.inject({ method: 'POST', url: '/equipamentos/importacao/validar', ...multipartPayload(buffer) })
  const first = send()
  const second = send()
  await new Promise((resolve) => setTimeout(resolve, 50))
  try {
    assert.equal((await send()).statusCode, 429)
  } finally { release() }
  for (const result of await Promise.all([first, second])) {
    assert.equal(result.statusCode, 500)
    assert.ok(!result.body.includes('DADO FICTICIO PRIVADO'))
  }
})
