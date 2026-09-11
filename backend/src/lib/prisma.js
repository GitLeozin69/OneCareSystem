import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'

const POOL_DEFAULTS = {
  connectionLimit: '10',
  minimumIdle: '1',
  acquireTimeout: '10000',
  connectTimeout: '5000',
}

export function normalizeDatabaseUrl(databaseUrl) {
  let url

  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL não é uma URL válida.')
  }

  if (!['mysql:', 'mariadb:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL deve usar o protocolo MySQL.')
  }

  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1'
  }

  const isLoopback = ['127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  if (isLoopback && !url.searchParams.has('allowPublicKeyRetrieval')) {
    url.searchParams.set('allowPublicKeyRetrieval', 'true')
  }

  for (const [name, value] of Object.entries(POOL_DEFAULTS)) {
    if (!url.searchParams.has(name)) {
      url.searchParams.set(name, value)
    }
  }

  return url.toString()
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não está configurada.')
  }

  const adapter = new PrismaMariaDb(normalizeDatabaseUrl(databaseUrl))

  return new PrismaClient({ adapter })
}
