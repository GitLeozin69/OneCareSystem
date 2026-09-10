import writeExcelFile from 'write-excel-file/node'
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate'

export const headers = ['Contract Name', 'Contract Status', 'Distributor Name', 'Reseller Name',
  'End User  Name', 'Contract Start Date', 'Contract End Date', 'Product Family', 'Serial #', 'Quantity']
export const exampleRow = (serial = 'EXCELTEST001') => ['CONTRATO-FICTICIO-A', 'Ignorado', 'DISTRIBUIDOR TESTE',
  'Revendedor fictício', 'CLIENTE TESTE', '01/01/2026', '2027-01-01', 'MODELO-TESTE', serial, 99]

export async function workbook(rows = [exampleRow()], titles = headers) {
  const data = [titles, ...rows].map((row) => row.map((value) => value instanceof Date
    ? { value, type: Date, format: 'dd/mm/yyyy' } : value))
  return writeExcelFile(data).toBuffer()
}

export function alterXml(buffer, name, transform) {
  const files = unzipSync(buffer)
  files[name] = strToU8(transform(strFromU8(files[name])))
  return Buffer.from(zipSync(files))
}

export function multipartPayload(buffer, { filename = 'ficticia.xlsx', field = 'arquivo', extra = '' } = {}) {
  const boundary = 'ONECARETESTBOUNDARY'
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      buffer, Buffer.from(`\r\n${extra}--${boundary}--\r\n`),
    ]),
  }
}

export function importFake(existing = []) {
  const state = { items: structuredClone(existing), queries: 0, writes: 0, transactions: 0, failBatch: 0, race: null }
  const prisma = {
    equipamento: {
      async findMany({ where }) {
        state.queries++
        return state.items.filter((item) => where.OR.some((filter) => Object.entries(filter)
          .some(([field, query]) => query.in.includes(item[field]))))
      },
      async createMany({ data }) {
        state.writes++
        if (state.failBatch === state.writes) throw Object.assign(new Error('simulated'), { code: 'P2002' })
        for (const item of data) {
          if (state.items.some((other) => other.serialNumber === item.serialNumber)) {
            throw Object.assign(new Error('duplicate'), { code: 'P2002' })
          }
          state.items.push(structuredClone(item))
        }
        return { count: data.length }
      },
    },
    async $transaction(callback) {
      state.transactions++
      if (state.race) state.items.push(state.race)
      const before = structuredClone(state.items)
      try { return await callback(prisma) } catch (error) { state.items = before; throw error }
    },
  }
  return { prisma, state }
}
