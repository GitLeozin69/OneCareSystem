import { AppError } from './appError.js'

export const EQUIPAMENTO_SORT_FIELDS = [
  'serialNumber',
  'partNumber',
  'patrimonio',
  'cliente',
  'contratoOnecare',
  'dataInicioOnecare',
  'dataFimOnecare',
  'createdAt',
  'updatedAt',
]

const allowedParameters = new Set([
  'q',
  'page',
  'limit',
  'sortBy',
  'order',
])
const allowedSortFields = new Set(EQUIPAMENTO_SORT_FIELDS)
const allowedOrders = new Set(['asc', 'desc'])
const paginationParameters = new Set(['page', 'limit'])

function invalidParameter(field, message) {
  return new AppError({
    statusCode: 400,
    code: 'PARAMETRO_INVALIDO',
    message: `O parâmetro ${field} é inválido.`,
    details: [{ field, message }],
  })
}

function normalizePositiveInteger(value, field, defaultValue, maximum) {
  if (value === undefined) return defaultValue

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw invalidParameter(field, 'Informe um número inteiro maior ou igual a 1.')
  }

  const normalized = Number(value)

  if (!Number.isSafeInteger(normalized) || normalized > maximum) {
    throw invalidParameter(
      field,
      `Informe um número inteiro entre 1 e ${maximum}.`,
    )
  }

  return normalized
}

function normalizeQ(value) {
  if (value === undefined) return undefined

  if (typeof value !== 'string') {
    throw invalidParameter('q', 'Informe um texto para pesquisa.')
  }

  return value.trim() || undefined
}

function rejectUnknownParameters(query, allowed) {
  const unknownParameter = Object.keys(query).find(
    (parameter) => !allowed.has(parameter),
  )

  if (unknownParameter) {
    throw invalidParameter(
      unknownParameter,
      'Este parâmetro não é aceito nesta consulta.',
    )
  }
}

export function normalizePaginationQuery(query = {}) {
  rejectUnknownParameters(query, paginationParameters)

  return {
    page: normalizePositiveInteger(
      query.page,
      'page',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    limit: normalizePositiveInteger(query.limit, 'limit', 20, 100),
  }
}

export function normalizeEquipamentoListQuery(query = {}) {
  rejectUnknownParameters(query, allowedParameters)

  const page = normalizePositiveInteger(query.page, 'page', 1, Number.MAX_SAFE_INTEGER)
  const limit = normalizePositiveInteger(query.limit, 'limit', 20, 100)
  const sortBy = query.sortBy ?? 'createdAt'
  const order = query.order ?? 'desc'

  if (typeof sortBy !== 'string' || !allowedSortFields.has(sortBy)) {
    throw invalidParameter(
      'sortBy',
      `Use um destes campos: ${EQUIPAMENTO_SORT_FIELDS.join(', ')}.`,
    )
  }

  if (typeof order !== 'string' || !allowedOrders.has(order)) {
    throw invalidParameter('order', 'Use asc ou desc.')
  }

  return {
    q: normalizeQ(query.q),
    page,
    limit,
    sortBy,
    order,
  }
}
