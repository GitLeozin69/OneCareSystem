import { Worker } from 'node:worker_threads'
import { importacaoError } from './importacaoError.js'

export function parseExcel(buffer, maxRows) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excelWorker.js', import.meta.url), {
      workerData: { buffer, maxRows },
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    })
    let finished = false
    const finish = (error, result) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      void worker.terminate()
      if (error) reject(error)
      else resolve(result)
    }
    const failure = () => importacaoError('ARQUIVO_INVALIDO', 'Não foi possível ler a planilha dentro dos limites de segurança.')
    const timer = setTimeout(() => finish(failure()), 15000)
    worker.on('message', (message) => {
      // O modo watch pode enviar mensagens internas antes do resultado do Excel.
      if (message?.type !== 'onecare:excel:response') return
      const { error, result } = message
      finish(error ? importacaoError(error.code, error.message, error.statusCode) : null, result)
    })
    worker.once('error', () => finish(failure()))
    worker.once('exit', () => { if (!finished) finish(failure()) })
  })
}
