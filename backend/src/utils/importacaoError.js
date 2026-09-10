import { AppError } from './appError.js'

export function importacaoError(code, message, statusCode = 422, details = []) {
  return new AppError({ code, message, statusCode, details })
}

export function importLimits(env = process.env) {
  const bounded = (value, fallback) => {
    const number = Number(value ?? fallback)
    if (!Number.isInteger(number) || number < 1 || number > fallback) {
      throw new Error('Limite de importação inválido na configuração.')
    }
    return number
  }
  return {
    maxBytes: bounded(env.IMPORT_MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
    maxRows: bounded(env.IMPORT_MAX_ROWS, 10000),
  }
}
