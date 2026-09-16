import { createHash, randomBytes } from 'node:crypto'

import argon2 from 'argon2'

import { AppError } from '../utils/appError.js'
import { normalizeUsername, publicUser } from '../utils/authValidation.js'
import { passwordChangeError, validatePasswordChange } from '../utils/passwordChangeValidation.js'

export const SESSION_COOKIE = 'onecare_session'
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
export const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
})

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function invalidCredentials() {
  return new AppError({ statusCode: 401, code: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha inválidos.' })
}

export function createAuthService({ prisma, sessionDurationHours = 8, clock = () => new Date() }) {
  const attempts = new Map()
  const dummyHash = argon2.hash(randomBytes(32), ARGON2_OPTIONS)

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

  async function login({ username: rawUsername, password, ip, previousToken }) {
    const username = normalizeUsername(rawUsername)
    const now = clock()
    const key = rateKey(ip, username)
    const attempt = getAttempt(key, now)
    if (attempt.count >= MAX_FAILURES) {
      const retryAfterSeconds = Math.max(1, Math.ceil(
        (attempt.startedAt + WINDOW_MS - now.getTime()) / 1000,
      ))
      throw new AppError({ statusCode: 429, code: 'LIMITE_LOGIN', message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.', retryAfterSeconds })
    }

    // Reserva antes do primeiro await: solicitações paralelas também contam.
    attempt.count += 1
    const user = await prisma.usuario.findUnique({ where: { username } })
    const hash = user?.senhaHash ?? await dummyHash
    const valid = typeof password === 'string' && await argon2.verify(hash, password).catch(() => false)
    if (!user || !user.ativo || !valid) {
      throw invalidCredentials()
    }

    attempts.delete(key)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + sessionDurationHours * 60 * 60 * 1000)
    await prisma.$transaction(async (tx) => {
      // Serializa a emissão de sessão com a troca de senha, verificando o hash
      // que foi autenticado antes de criar qualquer sessão nova.
      const updated = await tx.usuario.updateMany({
        where: { id: user.id, senhaHash: user.senhaHash, ativo: true },
        data: { ultimoLoginEm: now },
      })
      if (updated.count !== 1) throw invalidCredentials()
      await tx.sessao.deleteMany({ where: {
        OR: [
          { expiresAt: { lte: now } },
          ...(previousToken ? [{ tokenHash: hashSessionToken(previousToken) }] : []),
        ],
      } })
      await tx.sessao.create({ data: { usuarioId: user.id, tokenHash: hashSessionToken(token), expiresAt } })
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

  async function changeOwnPassword(userId, sessionToken, payload) {
    const { senhaAtual, novaSenha } = validatePasswordChange(payload)
    const user = await prisma.usuario.findUnique({ where: { id: userId } })
    if (!user?.ativo || !sessionToken) {
      throw new AppError({ statusCode: 401, code: 'NAO_AUTENTICADO', message: 'Autenticação necessária.' })
    }
    if (user.role !== 'ADMIN') {
      throw new AppError({ statusCode: 403, code: 'ACESSO_NEGADO', message: 'Acesso não permitido.' })
    }
    if (!await argon2.verify(user.senhaHash, senhaAtual)) {
      throw passwordChangeError('SENHA_ATUAL_INCORRETA', 'A senha atual está incorreta.')
    }
    const senhaHash = await argon2.hash(novaSenha, ARGON2_OPTIONS)
    await prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.updateMany({
        where: {
          id: userId, role: 'ADMIN', ativo: true, senhaHash: user.senhaHash,
          sessoes: { some: { tokenHash: hashSessionToken(sessionToken), expiresAt: { gt: clock() } } },
        },
        data: { senhaHash },
      })
      if (updated.count !== 1) {
        throw passwordChangeError('ALTERACAO_SENHA_NAO_CONCLUIDA', 'A alteração não foi concluída. Entre novamente e tente outra vez.')
      }
      await tx.sessao.deleteMany({ where: { usuarioId: userId } })
    })
  }

  return { login, logout, resolveSession, changeOwnPassword }
}
