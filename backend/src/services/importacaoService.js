import { parseExcel } from '../utils/parseExcel.js'
import { importacaoError, importLimits } from '../utils/importacaoError.js'
import { normalizeCreateEquipamento, normalizeEquipamentoField } from '../utils/equipamentoValidation.js'
import { fromUniqueConstraintError } from '../utils/equipamentoConflict.js'

export const importColumns = [
  ['Contract Name', 'contratoOnecare', false],
  ['Distributor Name', 'distribuidor', true],
  ['End User Name', 'cliente', true],
  ['Contract Start Date', 'dataInicioOnecare', true],
  ['Contract End Date', 'dataFimOnecare', true],
  ['Product Family', 'partNumber', true],
  ['Serial #', 'serialNumber', true],
]
const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const ignored = new Set(['contract status', 'reseller name', 'quantity'])
const blank = (value) => value === null || value === undefined || typeof value === 'string' && !value.trim()
const safeValue = (value) => value instanceof Date ? value.toISOString().slice(0, 10)
  : typeof value === 'string' ? value.slice(0, 300) : value ?? null
const chunks = function* (items, size = 500) {
  for (let index = 0; index < items.length; index += size) yield items.slice(index, index + size)
}

function dateText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return value
  const text = value.trim()
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text
}

function addError(row, field, code, message, conflictingRows) {
  row.errors.push({ rowNumber: row.rowNumber, field, code, value: row.data[field] ?? null,
    message, ...(conflictingRows ? { conflictingRows } : {}) })
  row.status = 'INVALID'
}

function summarize(rows, warnings) {
  const validRows = rows.filter((row) => row.status === 'VALID').length
  return { summary: { totalRows: rows.length, validRows, invalidRows: rows.length - validRows,
    canImport: rows.length > 0 && validRows === rows.length }, warnings, rows }
}

function normalizeRows({ data, formulaCells, invalidExcelDates }, maxRows) {
  if (!data.length) throw importacaoError('ARQUIVO_VAZIO', 'A planilha não contém cabeçalho e equipamentos.')
  const headers = data[0].map(normalizeHeader)
  const warnings = []
  const positions = new Map()
  const headerErrors = []
  for (const [label, field, required] of importColumns) {
    const matches = headers.flatMap((header, index) => header === normalizeHeader(label) ? [index] : [])
    if (matches.length > 1 || required && matches.length === 0) {
      headerErrors.push({ rowNumber: 1, field, code: 'CABECALHO_INVALIDO', value: label,
        message: matches.length > 1 ? `Coluna repetida: ${label}.` : `Coluna obrigatória ausente: ${label}.` })
    }
    if (matches.length) positions.set(field, matches[0])
  }
  if (formulaCells.some((cell) => cell.rowNumber === 1)) {
    headerErrors.push({ rowNumber: 1, field: 'arquivo', code: 'FORMULA_NAO_PERMITIDA', value: null,
      message: 'O cabeçalho não pode conter fórmulas.' })
  }
  if (headerErrors.length) throw importacaoError('CABECALHO_INVALIDO', 'Corrija o cabeçalho da planilha.', 422, headerErrors)
  const known = new Set(importColumns.map(([label]) => normalizeHeader(label)))
  headers.forEach((header, index) => {
    if (header && !known.has(header) && !ignored.has(header)) {
      warnings.push({ code: 'COLUNA_IGNORADA', column: index + 1,
        message: `Coluna ignorada: ${String(data[0][index]).slice(0, 100)}.` })
    }
  })
  const formulas = new Set(formulaCells.map((c) => `${c.rowNumber}:${c.column}`))
  const formulaRows = new Set(formulaCells.map((c) => c.rowNumber))
  const badDates = new Set(invalidExcelDates.map((c) => `${c.rowNumber}:${c.column}`))
  const rows = []
  for (let index = 1; index < data.length; index++) {
    const cells = data[index] ?? []
    if (cells.every(blank) && !formulaRows.has(index + 1)) continue
    if (rows.length >= maxRows) throw importacaoError('LIMITE_LINHAS', `Máximo de ${maxRows} linhas.`, 413)
    const row = { rowNumber: index + 1, status: 'VALID', data: {
      patrimonio: null, notaFiscal: null, dataUltimaConferencia: null,
    }, errors: [] }
    const normalized = { ...row.data }
    for (const [, field, required] of importColumns) {
      const column = positions.get(field)
      let value = column === undefined ? null : cells[column] ?? null
      const isDate = field.startsWith('data')
      if (isDate) value = dateText(value)
      if (!required && blank(value)) value = null
      row.data[field] = safeValue(value)
      if (formulas.has(`${row.rowNumber}:${column}`)) {
        addError(row, field, 'FORMULA_NAO_PERMITIDA', 'Substitua a fórmula por um valor literal.')
        continue
      }
      if (isDate && badDates.has(`${row.rowNumber}:${column}`)) {
        addError(row, field, 'DATA_INVALIDA', 'O dia fictício 29/02/1900 do Excel não é uma data válida.')
        continue
      }
      try {
        normalized[field] = normalizeEquipamentoField(field, value)
        row.data[field] = safeValue(normalized[field])
      } catch (error) {
        addError(row, field, error.code, error.message)
      }
    }
    if (row.status === 'VALID') {
      try { normalizeCreateEquipamento(row.data) } catch (error) {
        addError(row, error.details[0]?.field, error.code, error.message)
      }
    }
    rows.push(row)
  }
  if (!rows.length) throw importacaoError('ARQUIVO_VAZIO', 'A planilha não contém equipamentos.')
  for (const field of ['serialNumber', 'patrimonio']) {
    const byValue = new Map()
    for (const row of rows) {
      const value = row.data[field]
      if (!value) continue
      const group = byValue.get(value) ?? []
      group.push(row)
      byValue.set(value, group)
    }
    for (const group of byValue.values()) if (group.length > 1) {
      const sample = group.slice(0, 51)
      for (const row of group) {
        addError(row, field, field === 'serialNumber' ? 'SERIAL_DUPLICADO' : 'PATRIMONIO_DUPLICADO',
          'Valor repetido na própria planilha.', sample.filter((other) => other !== row).slice(0, 50).map((other) => other.rowNumber))
        const error = row.errors.at(-1)
        error.conflictingRowCount = group.length - 1
        error.conflictingRowsTruncated = group.length > 51
      }
    }
  }
  return { rows, warnings }
}

async function databaseConflicts(prisma, rows) {
  for (const group of chunks(rows)) {
    const serials = group.map((row) => row.data.serialNumber).filter((value) => typeof value === 'string' && value.length <= 100)
    const patrimonios = group.map((row) => row.data.patrimonio).filter(Boolean)
    const found = await prisma.equipamento.findMany({
      where: { OR: [{ serialNumber: { in: serials } }, ...(patrimonios.length ? [{ patrimonio: { in: patrimonios } }] : [])] },
      select: { serialNumber: true, patrimonio: true },
    })
    const existingSerials = new Set(found.map((item) => item.serialNumber.toUpperCase()))
    const existingPatrimonios = new Set(found.map((item) => item.patrimonio).filter(Boolean))
    for (const row of group) {
      if (existingSerials.has(row.data.serialNumber)) addError(row, 'serialNumber', 'SERIAL_DUPLICADO',
        'Serial já cadastrado no sistema, inclusive se arquivado.')
      if (row.data.patrimonio && existingPatrimonios.has(row.data.patrimonio)) addError(row, 'patrimonio',
        'PATRIMONIO_DUPLICADO', 'Patrimônio já cadastrado no sistema, inclusive se arquivado.')
    }
  }
}

export function createImportacaoService({ prisma, limits = importLimits(), parser = parseExcel }) {
  async function validate(file) {
    if (!file || !/\.xlsx$/i.test(file.filename ?? '')) throw importacaoError('FORMATO_INVALIDO', 'Envie somente um arquivo .xlsx.', 415)
    if (!file.buffer?.length) throw importacaoError('ARQUIVO_VAZIO', 'O arquivo está vazio.', 400)
    if (file.buffer.length > limits.maxBytes) throw importacaoError('LIMITE_ARQUIVO', 'O arquivo excede o limite de tamanho.', 413)
    const { rows, warnings } = normalizeRows(await parser(file.buffer, limits.maxRows), limits.maxRows)
    await databaseConflicts(prisma, rows)
    return summarize(rows, warnings)
  }
  return {
    validate,
    async confirm(file) {
      const preview = await validate(file)
      if (!preview.summary.canImport) throw importacaoError('IMPORTACAO_INVALIDA',
        'Nenhum equipamento foi importado. Corrija todas as linhas inválidas.', 422,
        preview.rows.flatMap((row) => row.errors))
      let writing = []
      try {
        await prisma.$transaction(async (transaction) => {
          for (const group of chunks(preview.rows)) {
            writing = group
            await transaction.equipamento.createMany({ data: group.map((row) => normalizeCreateEquipamento(row.data)) })
          }
        }, { timeout: 30000, maxWait: 5000 })
      } catch (error) {
        if (error.code !== 'P2002') throw error
        await databaseConflicts(prisma, preview.rows)
        if (!preview.rows.some((row) => row.errors.length)) {
          const conflict = fromUniqueConstraintError(error)
          const field = conflict?.code === 'PATRIMONIO_DUPLICADO' ? 'patrimonio'
            : conflict?.code === 'SERIAL_DUPLICADO' ? 'serialNumber' : 'arquivo'
          for (const row of writing) addError(row, field, 'CONFLITO_CONCORRENTE',
            'Este lote encontrou um conflito de unicidade que não está mais visível. Valide novamente.')
        }
        throw importacaoError('IMPORTACAO_CONFLITO',
          'Um valor passou a existir durante a confirmação. Nada foi importado; valide novamente.', 409,
          preview.rows.flatMap((row) => row.errors))
      }
      return { message: 'Importação concluída com sucesso.',
        summary: { totalRows: preview.rows.length, importedRows: preview.rows.length } }
    },
  }
}
