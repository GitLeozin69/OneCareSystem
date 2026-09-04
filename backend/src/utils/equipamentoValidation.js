import { AppError } from './appError.js'

const fields = {
  serialNumber: { type: 'serial', required: true, maxLength: 100 },
  partNumber: { type: 'string', required: true, maxLength: 100 },
  cliente: { type: 'string', required: true, maxLength: 255 },
  patrimonio: { type: 'optionalString', maxLength: 100 },
  contratoOnecare: { type: 'optionalString', maxLength: 100 },
  dataInicioOnecare: { type: 'date', required: true },
  dataFimOnecare: { type: 'date', required: true },
  dataUltimaConferencia: { type: 'optionalDate' },
}

function validationError(code, message, field) {
  return new AppError({
    statusCode: code === 'CAMPO_OBRIGATORIO' ? 400 : 422,
    code,
    message,
    details: field ? [{ field }] : [],
  })
}

function normalizeRequiredString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(
      'CAMPO_OBRIGATORIO',
      `O campo ${field} é obrigatório.`,
      field,
    )
  }

  const normalized = value.trim()

  if (normalized.length > maxLength) {
    throw validationError(
      'CAMPO_MUITO_LONGO',
      `O campo ${field} excede o tamanho máximo permitido.`,
      field,
    )
  }

  return normalized
}

function normalizeOptionalString(value, field, maxLength) {
  if (value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw validationError(
      'CAMPO_INVALIDO',
      `O campo ${field} deve ser um texto ou nulo.`,
      field,
    )
  }

  const normalized = value.trim()

  if (normalized.length === 0) {
    return null
  }

  if (normalized.length > maxLength) {
    throw validationError(
      'CAMPO_MUITO_LONGO',
      `O campo ${field} excede o tamanho máximo permitido.`,
      field,
    )
  }

  return normalized
}

function normalizeSerial(value) {
  const serialNumber = normalizeRequiredString(value, 'serialNumber', 100)
    .toUpperCase()

  if (!/^[A-Z0-9]+$/.test(serialNumber)) {
    throw validationError(
      'SERIAL_INVALIDO',
      'O número de série deve conter apenas letras de A a Z e números de 0 a 9.',
      'serialNumber',
    )
  }

  return serialNumber
}

function parseDate(value, field, optional) {
  if (optional && (value === null || value === '')) {
    return null
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(
      'DATA_INVALIDA',
      `O campo ${field} deve estar no formato AAAA-MM-DD.`,
      field,
    )
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw validationError(
      'DATA_INVALIDA',
      `O campo ${field} contém uma data inexistente.`,
      field,
    )
  }

  return date
}

function normalizeField(field, value, definition) {
  if (definition.type === 'serial') {
    return normalizeSerial(value)
  }

  if (definition.type === 'string') {
    return normalizeRequiredString(value, field, definition.maxLength)
  }

  if (definition.type === 'optionalString') {
    return normalizeOptionalString(value, field, definition.maxLength)
  }

  if (definition.type === 'date') {
    return parseDate(value, field, false)
  }

  return parseDate(value, field, true)
}

function normalizePayload(payload, partial) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError(
      'REQUISICAO_INVALIDA',
      'O corpo da requisição deve ser um objeto.',
    )
  }

  const keys = Object.keys(payload)

  if (partial && keys.length === 0) {
    throw validationError(
      'REQUISICAO_INVALIDA',
      'Informe pelo menos um campo para atualização.',
    )
  }

  const unknownField = keys.find((field) => !Object.hasOwn(fields, field))

  if (unknownField) {
    throw validationError(
      'CAMPO_INVALIDO',
      `O campo ${unknownField} não é permitido.`,
      unknownField,
    )
  }

  const normalized = {}

  for (const [field, definition] of Object.entries(fields)) {
    if (!Object.hasOwn(payload, field)) {
      if (!partial && definition.required) {
        throw validationError(
          'CAMPO_OBRIGATORIO',
          `O campo ${field} é obrigatório.`,
          field,
        )
      }

      continue
    }

    normalized[field] = normalizeField(field, payload[field], definition)
  }

  return normalized
}

function validateDateRange(dataInicioOnecare, dataFimOnecare) {
  if (dataFimOnecare < dataInicioOnecare) {
    throw validationError(
      'INTERVALO_DATAS_INVALIDO',
      'A data de término não pode ser anterior à data de início.',
      'dataFimOnecare',
    )
  }
}

export function normalizeCreateEquipamento(payload) {
  const normalized = normalizePayload(payload, false)
  validateDateRange(
    normalized.dataInicioOnecare,
    normalized.dataFimOnecare,
  )

  return normalized
}

export function normalizeUpdateEquipamento(payload, current) {
  const normalized = normalizePayload(payload, true)
  validateDateRange(
    normalized.dataInicioOnecare ?? current.dataInicioOnecare,
    normalized.dataFimOnecare ?? current.dataFimOnecare,
  )

  return normalized
}

export function normalizeEquipamentoId(value) {
  const id = Number(value)

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw validationError(
      'ID_INVALIDO',
      'O identificador do equipamento é inválido.',
      'id',
    )
  }

  return id
}
