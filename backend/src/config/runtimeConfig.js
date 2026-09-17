import { readSecurityConfig } from '../plugins/security.js'

const LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
const RAILWAY_HEALTHCHECK_HOST = 'healthcheck.railway.app'

function parsePort(value, production) {
  if ((value === undefined || value === '') && !production) return 3000
  if (!/^\d+$/.test(value ?? '')) throw new Error('PORT deve ser um inteiro entre 1 e 65535.')
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.')
  }
  return port
}

function parseAllowedHosts(value, production) {
  if (!value?.trim()) {
    if (production) throw new Error('ALLOWED_HOSTS é obrigatório em produção.')
    return null
  }
  const hosts = value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  const invalid = hosts.some((host) => host.includes('://') || host.includes('/') || host.includes(' '))
  if (!hosts.length || invalid) throw new Error('ALLOWED_HOSTS deve conter hostnames explícitos.')
  return new Set(production ? [...hosts, RAILWAY_HEALTHCHECK_HOST] : hosts)
}

export function readRuntimeConfig(env = process.env) {
  const security = readSecurityConfig(env)
  const production = security.production
  if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL é obrigatória.')

  let databaseUrl
  try { databaseUrl = new URL(env.DATABASE_URL) } catch { throw new Error('DATABASE_URL não é uma URL válida.') }
  if (!['mysql:', 'mariadb:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL deve usar o protocolo MySQL.')
  }
  const logLevel = env.LOG_LEVEL || 'info'
  if (!LOG_LEVELS.has(logLevel)) throw new Error('LOG_LEVEL inválido.')
  if (production && logLevel === 'silent') throw new Error('LOG_LEVEL não pode ser silent em produção.')
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'false') {
    throw new Error('TRUST_PROXY permanece desabilitado até a validação da topologia publicada.')
  }

  return {
    allowedHosts: parseAllowedHosts(env.ALLOWED_HOSTS, production),
    databaseUrl: env.DATABASE_URL,
    host: production ? '0.0.0.0' : env.HOST || '127.0.0.1',
    logLevel,
    port: parsePort(env.PORT, production),
    production,
    security,
    trustProxy: false,
  }
}

export function requestHostIsAllowed(hostHeader, allowedHosts) {
  if (!allowedHosts) return true
  if (typeof hostHeader !== 'string' || !hostHeader) return false
  let hostname
  try { hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase() } catch { return false }
  return allowedHosts.has(hostname)
}
