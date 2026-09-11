import assert from 'node:assert/strict'
import { parseExcel } from '../../src/utils/parseExcel.js'
import { workbook, headers, exampleRow } from './excelFixture.js'

const result = await parseExcel(await workbook(), 10000)
assert.deepEqual(result.data, [headers, exampleRow().map(String)])
await assert.rejects(parseExcel(Buffer.from('arquivo invalido'), 10000), { code: 'ARQUIVO_INVALIDO' })
console.log('EXCEL_WATCH_OK')
