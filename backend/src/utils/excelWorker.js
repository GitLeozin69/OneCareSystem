import { parentPort, workerData } from 'node:worker_threads'
import { readWorkbook } from './excelWorkbook.js'

try {
  parentPort.postMessage({ type: 'onecare:excel:response', result: await readWorkbook(Buffer.from(workerData.buffer), workerData.maxRows) })
} catch (error) {
  parentPort.postMessage({ type: 'onecare:excel:response', error: { code: error.code, message: error.message, statusCode: error.statusCode } })
}
