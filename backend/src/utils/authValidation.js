import { AppError } from './appError.js'

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/

export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validateUsername(value) {
  const username = normalizeUsername(value)
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError({
      statusCode: 400,
      code: 'USERNAME_INVALIDO',
      message: 'O usuário deve ter de 3 a 50 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.',
    })
  }
  return username
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new AppError({
      statusCode: 400,
      code: 'SENHA_INVALIDA',
      message: 'A senha deve ter de 12 a 128 caracteres.',
    })
  }
  return value
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    ativo: user.ativo,
    ultimoLoginEm: user.ultimoLoginEm,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
