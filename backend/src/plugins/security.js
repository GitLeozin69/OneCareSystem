import { createHash, randomBytes } from 'node:crypto'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import csrfProtection from '@fastify/csrf-protection'

import { AppError } from '../utils/appError.js'
import { SESSION_COOKIE } from '../services/authService.js'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('COOKIE_SECURE deve ser true ou false.')
}

function parseOrigins(value) {
  const origins = (value ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',').map((item) => item.trim()).filter(Boolean)
  const invalid = origins.some((origin) => {
    try {
      const parsed = new URL(origin)
      return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password
    } catch { return true }
  })
  if (!origins.length || invalid) {
    throw new Error('FRONTEND_ORIGIN deve conter origens HTTP(S) explícitas, separadas por vírgula.')
  }
  return new Set(origins)
}

export function readSecurityConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const cookieSecure = parseBoolean(env.COOKIE_SECURE, production)
  if (production && !cookieSecure) throw new Error('COOKIE_SECURE deve ser true em produção.')
  if (production && !env.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN é obrigatório em produção.')
  if (production && (!env.CSRF_SECRET || env.CSRF_SECRET.length < 32)) {
    throw new Error('CSRF_SECRET com pelo menos 32 caracteres é obrigatório em produção.')
  }
  const duration = Number.parseInt(env.SESSION_DURATION_HOURS ?? '8', 10)
  if (!Number.isInteger(duration) || duration < 1 || duration > 168) {
    throw new Error('SESSION_DURATION_HOURS deve ser um inteiro entre 1 e 168.')
  }
  return {
    allowedOrigins: parseOrigins(env.FRONTEND_ORIGIN),
    cookieSecure,
    csrfSecret: env.CSRF_SECRET || randomBytes(32).toString('hex'),
    sessionDurationHours: duration,
  }
}

function accessError(statusCode, code, message) {
  return new AppError({ statusCode, code, message })
}

export async function registerSecurity(app, { authService, config }) {
  const signingSecret = createHash('sha256').update(`cookie:${config.csrfSecret}`).digest('hex')
  const hmacKey = createHash('sha256').update(`csrf:${config.csrfSecret}`).digest()
  await app.register(cookie, { secret: signingSecret })
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || config.allowedOrigins.has(origin))
    },
  })
  await app.register(csrfProtection, {
    cookieKey: 'onecare_csrf',
    cookieOpts: { httpOnly: true, path: '/', sameSite: 'strict', secure: config.cookieSecure, signed: true },
    csrfOpts: { hmacKey },
    getToken: (request) => request.headers['x-csrf-token'],
  })

  app.decorateRequest('authUser', null)
  app.addHook('onRequest', async (request, reply) => {
    const access = request.routeOptions.config.access ?? 'AUTHENTICATED'
    if (access !== 'PUBLIC') {
      const user = await authService.resolveSession(request.cookies[SESSION_COOKIE])
      if (!user) throw accessError(401, 'NAO_AUTENTICADO', 'Autenticação necessária.')
      request.authUser = user
      if (access === 'ADMIN' && user.role !== 'ADMIN') {
        throw accessError(403, 'ACESSO_NEGADO', 'Acesso não permitido.')
      }
    }

    if (!MUTATING_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (!origin || !config.allowedOrigins.has(origin)) {
      throw accessError(403, 'ORIGEM_NAO_PERMITIDA', 'Origem da requisição não permitida.')
    }
    await new Promise((resolve, reject) => {
      app.csrfProtection(request, reply, (error) => error ? reject(error) : resolve())
    })
  })
}

export function sessionCookieOptions(config, expiresAt) {
  return { httpOnly: true, path: '/', sameSite: 'strict', secure: config.cookieSecure, expires: expiresAt }
}
