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
