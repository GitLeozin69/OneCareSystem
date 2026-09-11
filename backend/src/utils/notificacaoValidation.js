import { AppError } from './appError.js'

function invalidParameter(field, message) {
  return new AppError({
    statusCode: 400,
    code: 'PARAMETRO_INVALIDO',
    message: `O parâmetro ${field} é inválido.`,
    details: [{ field, message }],
  })
}

function positiveInteger(value, field, defaultValue, maximum) {
  if (value === undefined) return defaultValue
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw invalidParameter(field, 'Informe um número inteiro maior ou igual a 1.')
  }

  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized > maximum) {
    throw invalidParameter(field, `Informe um número inteiro entre 1 e ${maximum}.`)
  }
  return normalized
}

export function normalizeNotificacaoListQuery(query = {}) {
  const unknown = Object.keys(query).find((field) => !['page', 'limit', 'lida'].includes(field))
  if (unknown) throw invalidParameter(unknown, 'Este parâmetro não é aceito nesta consulta.')

  let lida
  if (query.lida !== undefined) {
    if (query.lida !== 'true' && query.lida !== 'false') {
      throw invalidParameter('lida', 'Use true ou false.')
    }
    lida = query.lida === 'true'
  }

  return {
    page: positiveInteger(query.page, 'page', 1, Number.MAX_SAFE_INTEGER),
    limit: positiveInteger(query.limit, 'limit', 20, 100),
    lida,
  }
}

export function normalizeNotificacaoId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw invalidParameter('id', 'Informe um identificador inteiro válido.')
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw invalidParameter('id', 'Informe um identificador válido.')
  return id
}
