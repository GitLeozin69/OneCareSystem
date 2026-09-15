import { AppError } from './appError.js'
import { validatePassword } from './authValidation.js'

export function passwordChangeError(code, message) {
  return new AppError({ statusCode: 400, code, message })
}

export function validatePasswordChange(payload) {
  const fields = ['senhaAtual', 'novaSenha', 'confirmacaoNovaSenha']
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
    Object.keys(payload).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(payload, field) ||
      typeof payload[field] !== 'string' || !payload[field].trim() || payload[field].length > 128)) {
    throw passwordChangeError('REQUISICAO_INVALIDA', 'Informe somente os três campos de senha, como textos não vazios de até 128 caracteres.')
  }
  validatePassword(payload.novaSenha)
  if (payload.novaSenha !== payload.confirmacaoNovaSenha) {
    throw passwordChangeError('CONFIRMACAO_SENHA_INVALIDA', 'A confirmação deve ser igual à nova senha.')
  }
  if (payload.novaSenha === payload.senhaAtual) {
    throw passwordChangeError('SENHA_REUTILIZADA', 'A nova senha deve ser diferente da senha atual.')
  }
  return payload
}
