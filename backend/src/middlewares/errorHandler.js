import { AppError } from '../utils/appError.js'
import { fromUniqueConstraintError } from '../utils/equipamentoConflict.js'

function validationDetails(validation = []) {
  return validation.map((item) => ({
    field: item.instancePath || item.params?.missingProperty || null,
    message: item.message ?? 'Valor inválido.',
  }))
}

export function errorHandler(error, request, reply) {
  error = fromUniqueConstraintError(error) ?? error

  if (error instanceof AppError) {
    if (error.statusCode === 429 && Number.isInteger(error.retryAfterSeconds)) {
      reply.header('Retry-After', String(error.retryAfterSeconds))
    }
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    })
  }

  if (error.validation) {
    return reply.code(400).send({
      error: 'REQUISICAO_INVALIDA',
      message: 'Os dados enviados são inválidos.',
      details: validationDetails(error.validation),
    })
  }

  if (error.code === 'P2025') {
    return reply.code(404).send({
      error: 'EQUIPAMENTO_NAO_ENCONTRADO',
      message: 'Equipamento não encontrado.',
      details: [],
    })
  }

  if (error.statusCode === 400) {
    return reply.code(400).send({
      error: 'REQUISICAO_INVALIDA',
      message: 'A requisição não pôde ser processada.',
      details: [],
    })
  }

  if (error.statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.code(413).send({
      error: 'LIMITE_REQUISICAO',
      message: 'A requisição excede o limite de tamanho permitido.',
      details: [],
    })
  }

  if (error.code === 'FST_CSRF_INVALID_TOKEN' || error.statusCode === 403) {
    return reply.code(403).send({
      error: 'CSRF_INVALIDO',
      message: 'A proteção da sessão expirou. Atualize a página e tente novamente.',
      details: [],
    })
  }

  if (error.statusCode === 415) {
    return reply.code(415).send({
      error: 'TIPO_CONTEUDO_NAO_SUPORTADO',
      message: 'Tipo de conteúdo não suportado.',
      details: [],
    })
  }

  if (error.statusCode === 414) {
    return reply.code(414).send({
      error: 'LIMITE_URL', message: 'A URL excede o limite permitido.', details: [],
    })
  }

  request.log.error(
    { errorName: error.name, errorCode: error.code },
    'Erro interno não tratado',
  )

  return reply.code(500).send({
    error: 'ERRO_INTERNO',
    message: 'Não foi possível processar a solicitação.',
    details: [],
  })
}
