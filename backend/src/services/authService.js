import { createHash, randomBytes } from 'node:crypto'

import argon2 from 'argon2'

import { AppError } from '../utils/appError.js'
import { normalizeUsername, publicUser } from '../utils/authValidation.js'

export const SESSION_COOKIE = 'onecare_session'
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function invalidCredentials() {
  return new AppError({ statusCode: 401, code: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha inválidos.' })
}

export function createAuthService({ prisma, sessionDurationHours = 8, clock = () => new Date() }) {
  const attempts = new Map()
  const dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id })

  function rateKey(ip, username) {
    const usernameHash = createHash('sha256').update(username).digest('hex')
    return `${ip ?? 'desconhecido'}|${usernameHash}`
  }

  function getAttempt(key, now) {
    const entry = attempts.get(key)
    if (!entry || now.getTime() - entry.startedAt >= WINDOW_MS) {
      if (!entry && attempts.size >= 10000) attempts.delete(attempts.keys().next().value)
      const fresh = { count: 0, startedAt: now.getTime() }
      attempts.set(key, fresh)
      return fresh
    }
    return entry
  }

  async function login({ username: rawUsername, password, ip }) {
    const username = normalizeUsername(rawUsername)
    const now = clock()
    const key = rateKey(ip, username)
    const attempt = getAttempt(key, now)
    if (attempt.count >= MAX_FAILURES) {
      throw new AppError({ statusCode: 429, code: 'LIMITE_LOGIN', message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' })
    }

    const user = await prisma.usuario.findUnique({ where: { username } })
    const hash = user?.senhaHash ?? await dummyHash
    const valid = typeof password === 'string' && await argon2.verify(hash, password).catch(() => false)
    if (!user || !user.ativo || !valid) {
      attempt.count += 1
      throw invalidCredentials()
    }

    attempts.delete(key)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + sessionDurationHours * 60 * 60 * 1000)
    await prisma.$transaction(async (tx) => {
      await tx.sessao.create({ data: { usuarioId: user.id, tokenHash: hashSessionToken(token), expiresAt } })
      await tx.usuario.update({ where: { id: user.id }, data: { ultimoLoginEm: now } })
    })
    return { token, expiresAt, user: publicUser({ ...user, ultimoLoginEm: now }) }
  }

  async function resolveSession(token) {
    if (!token || typeof token !== 'string') return null
    const tokenHash = hashSessionToken(token)
    const session = await prisma.sessao.findUnique({
      where: { tokenHash }, include: { usuario: true },
    })
    if (!session) return null
    if (session.expiresAt <= clock() || !session.usuario.ativo) {
      await prisma.sessao.deleteMany({ where: { tokenHash } })
      return null
    }
    return publicUser(session.usuario)
  }

  async function logout(token) {
    if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
  }

  return { login, logout, resolveSession }
}
