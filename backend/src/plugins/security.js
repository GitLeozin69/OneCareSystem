import { createHash, randomBytes } from 'node:crypto'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import csrfProtection from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'

import { AppError } from '../utils/appError.js'
import { hashSessionToken, SESSION_COOKIE } from '../services/authService.js'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const RATE_LIMIT_CAPACITY = 20000
const DEFAULT_READ_RATE = Object.freeze({ max: 300, windowMs: 60_000, name: 'read' })
const DEFAULT_WRITE_RATE = Object.freeze({ max: 120, windowMs: 60_000, name: 'write' })

export const LOGGER_REDACT_PATHS = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.senha',
  'req.body.senhaHash',
  'DATABASE_URL',
  'databaseUrl',
  '*.DATABASE_URL',
  '*.databaseUrl',
  'token',
  'sessionToken',
  'csrfToken',
  '*.token',
  '*.sessionToken',
  '*.csrfToken',
  'password',
  'senha',
  'senhaHash',
  '*.password',
  '*.senha',
  '*.senhaHash',
])

export function securityLoggerOptions() {
  return { redact: { paths: [...LOGGER_REDACT_PATHS], censor: '[REMOVIDO]' } }
}

export function csrfUserInfo(sessionToken) {
  return hashSessionToken(typeof sessionToken === 'string' && sessionToken
    ? sessionToken
    : 'onecare:anonymous')
}

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
  const nodeEnv = env.NODE_ENV || 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.')
  }
  const production = nodeEnv === 'production'
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
  const allowedOrigins = parseOrigins(env.FRONTEND_ORIGIN)
  if (production && [...allowedOrigins].some((origin) => !origin.startsWith('https://'))) {
    throw new Error('FRONTEND_ORIGIN deve usar HTTPS em produção.')
  }
  return {
    allowedOrigins,
    cookieSecure,
    csrfSecret: env.CSRF_SECRET || randomBytes(32).toString('hex'),
    sessionDurationHours: duration,
    production,
  }
}

function accessError(statusCode, code, message) {
  return new AppError({ statusCode, code, message })
}

export async function registerSecurity(app, { authService, config }) {
  const signingSecret = createHash('sha256').update(`cookie:${config.csrfSecret}`).digest('hex')
  const hmacKey = createHash('sha256').update(`csrf:${config.csrfSecret}`).digest()
  const rateBuckets = new Map()
  await app.register(cookie, { secret: signingSecret })
  await app.register(cors, {
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    strictPreflight: true,
    maxAge: 600,
    origin(origin, callback) {
      callback(null, !origin || config.allowedOrigins.has(origin))
    },
  })
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: config.production
      ? { maxAge: 31_536_000, includeSubDomains: false, preload: false }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  })
  await app.register(csrfProtection, {
    cookieKey: 'onecare_csrf',
    cookieOpts: { httpOnly: true, path: '/', sameSite: 'strict', secure: config.cookieSecure, signed: true },
    csrfOpts: { hmacKey },
    getUserInfo: (request) => csrfUserInfo(request.cookies[SESSION_COOKIE]),
    getToken: (request) => request.headers['x-csrf-token'],
  })

  app.decorateRequest('authUser', null)
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    reply.header('Pragma', 'no-cache')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    reply.removeHeader('Server')
  })
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

    const configuredRate = request.routeOptions.config.rateLimit
    const policy = configuredRate === false ? null : configuredRate ??
      (MUTATING_METHODS.has(request.method) ? DEFAULT_WRITE_RATE : DEFAULT_READ_RATE)
    if (policy) {
      const now = Date.now()
      const identity = request.authUser ? `user:${request.authUser.id}` : `ip:${request.ip}`
      const route = policy.name ?? `${request.method}:${request.routeOptions.url}`
      const key = `${identity}|${route}`
      let bucket = rateBuckets.get(key)
      if (!bucket || now >= bucket.resetAt) {
        if (!bucket && rateBuckets.size >= RATE_LIMIT_CAPACITY) {
          rateBuckets.delete(rateBuckets.keys().next().value)
        }
        bucket = { count: 0, resetAt: now + policy.windowMs }
        rateBuckets.set(key, bucket)
      }
      if (bucket.count >= policy.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
        throw new AppError({
          statusCode: 429,
          code: 'LIMITE_REQUISICOES',
          message: 'Muitas solicitações. Aguarde e tente novamente.',
          retryAfterSeconds,
        })
      }
      bucket.count += 1
    }

    if (!MUTATING_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (!origin || !config.allowedOrigins.has(origin)) {
      throw accessError(403, 'ORIGEM_NAO_PERMITIDA', 'Origem da requisição não permitida.')
    }
    const csrfToken = request.headers['x-csrf-token']
    if (typeof csrfToken !== 'string' || csrfToken.length > 512) {
      throw accessError(403, 'CSRF_INVALIDO', 'A proteção da sessão expirou. Atualize a página e tente novamente.')
    }
    await new Promise((resolve, reject) => {
      app.csrfProtection(request, reply, (error) => error ? reject(error) : resolve())
    })
  })
}

export function sessionCookieOptions(config, expiresAt) {
  return { httpOnly: true, path: '/', sameSite: 'strict', secure: config.cookieSecure, expires: expiresAt }
}
