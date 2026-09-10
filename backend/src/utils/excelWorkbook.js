import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { readSheet } from 'read-excel-file/node'
import { importacaoError } from './importacaoError.js'

const array = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value]
const invalid = () => importacaoError('ARQUIVO_INVALIDO', 'Envie uma planilha XLSX válida, não protegida e sem macros.')

// Expande a representação numérica armazenada sem passar por Number e perder dígitos.
export function decimalText(raw) {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(raw)
  if (!match) throw invalid()
  const [, sign, whole, fraction = '', exponent = '0'] = match
  const position = whole.length + Number(exponent)
  if (Math.abs(position) > 100) throw invalid()
  const digits = whole + fraction
  const text = position <= 0 ? '0.' + '0'.repeat(-position) + digits
    : position >= digits.length ? digits + '0'.repeat(position - digits.length)
      : digits.slice(0, position) + '.' + digits.slice(position)
  return (sign === '-' ? '-' : '') + text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export async function readWorkbook(buffer, maxRows) {
  try {
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw invalid()
    let total = 0
    let entries = 0
    const names = new Set()
    const files = unzipSync(buffer, { filter(entry) {
      total += entry.originalSize
      entries++
      if (names.has(entry.name) || entries > 1000 || total > 50 * 1024 * 1024 ||
        entry.originalSize > 20 * 1024 * 1024) throw invalid()
      names.add(entry.name)
      return true
    } })
    if (Object.keys(files).some((name) => /vbaProject|externalLinks|activeX/i.test(name))) throw invalid()
    const parser = new XMLParser({
      ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false,
      parseAttributeValue: false, trimValues: false, processEntities: true,
    })
    const xml = (name) => {
      if (!files[name]) throw invalid()
      const text = strFromU8(files[name])
      if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw invalid()
      return parser.parse(text)
    }
    // A leitura da biblioteca também acessa estilos e strings compartilhadas.
    for (const name of Object.keys(files).filter((name) => /\.(xml|rels)$/i.test(name))) {
      const text = strFromU8(files[name])
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw invalid()
    }
    const types = xml('[Content_Types].xml')
    if (!array(types.Types?.Override).some((item) => item['@_ContentType'] ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) throw invalid()
    const workbook = xml('xl/workbook.xml').workbook
    if (!workbook || workbook.workbookProtection !== undefined || Array.isArray(workbook.workbookPr)) throw invalid()
    const sheet = array(workbook.sheets?.sheet)[0]
    if (!sheet) throw invalid()
    const relation = array(xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship)
      .find((item) => item['@_Id'] === sheet['@_id'])
    if (!relation || relation['@_TargetMode'] === 'External') throw invalid()
    const target = relation['@_Target'].startsWith('/') ? relation['@_Target'].slice(1)
      : path.posix.normalize('xl/' + relation['@_Target'])
    if (!target.startsWith('xl/worksheets/')) throw invalid()
    const worksheet = xml(target).worksheet
    if (!worksheet || worksheet.sheetProtection !== undefined) throw invalid()
    const formulaCells = []
    const invalidExcelDates = []
    const numericCells = new Map()
    const seen = new Set()
    const date1904 = ['1', 'true'].includes(workbook.workbookPr?.['@_date1904'])
    for (const row of array(worksheet.sheetData?.row)) {
      const rowNumber = Number(row['@_r'])
      if (!Number.isInteger(rowNumber) || rowNumber < 1) throw invalid()
      if (rowNumber > 100001) throw importacaoError('LIMITE_LINHAS', 'A região física da planilha excede o limite de segurança.', 413)
      for (const cell of array(row.c)) {
        const address = cell['@_r']
        const coordinate = /^([A-Z]+)([1-9]\d*)$/.exec(address ?? '')
        if (!coordinate || Number(coordinate[2]) !== rowNumber || seen.has(address)) throw invalid()
        seen.add(address)
        const column = [...coordinate[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
        if (column > 256) throw invalid()
        if (cell.f !== undefined) formulaCells.push({ rowNumber, column: column - 1 })
        if (!cell['@_t'] || cell['@_t'] === 'n') numericCells.set(`${rowNumber}:${column - 1}`, cell.v)
        if (!date1904 && (!cell['@_t'] || cell['@_t'] === 'n') && Math.floor(Number(cell.v)) === 60) {
          invalidExcelDates.push({ rowNumber, column: column - 1 })
        }
      }
    }
    // Limita também dimensões artificiais que poderiam expandir matrizes esparsas.
    const dimension = worksheet.dimension?.['@_ref']
    if (dimension) {
      const last = /([A-Z]+)(\d+)$/.exec(dimension)
      if (!last || Number(last[2]) > 100001 || last[1].length > 2 ||
        [...last[1]].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0) > 256) throw invalid()
    }
    const data = await readSheet(buffer, 1, { trim: false, parseNumber: decimalText })
    // Usa a época explícita do OOXML, inclusive date1904="true", e somente dias civis.
    // Evita depender da interpretação booleana da biblioteca ou de fusos locais.
    data.forEach((row, index) => row.forEach((value, column) => {
      const serial = numericCells.get(`${index + 1}:${column}`)
      if (value instanceof Date && serial !== undefined) {
        const day = Math.floor(Number(serial))
        if (!Number.isFinite(day)) throw invalid()
        const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)
        row[column] = new Date(origin + (day - (!date1904 && day >= 60 ? 1 : 0)) * 86400000)
      }
    }))
    if (data.slice(1).filter((row) => row.some((value) => value !== null && value !== undefined &&
      !(typeof value === 'string' && !value.trim()))).length > maxRows) {
      throw importacaoError('LIMITE_LINHAS', `A planilha deve ter no máximo ${maxRows} linhas de dados.`, 413)
    }
    return { data, formulaCells, invalidExcelDates }
  } catch (error) {
    if (error.code && error.statusCode) throw error
    throw invalid()
  }
}
