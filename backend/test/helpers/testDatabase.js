import { createPrismaClient } from '../../src/lib/prisma.js'

export function testDatabaseUrl(env = process.env) {
  let url
  try { url = new URL(env.TEST_DATABASE_URL) } catch {
    throw new Error('Configure TEST_DATABASE_URL para o banco local exclusivo ZebraOneCareTest.')
  }
  if (env.NODE_ENV === 'production' || !['mysql:', 'mariadb:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)).toLowerCase() !== 'zebraonecaretest') {
    throw new Error('Integrações permitidas somente no MySQL local ZebraOneCareTest, fora de produção.')
  }
  return url.toString()
}

export function createTestPrismaClient() {
  return createPrismaClient(testDatabaseUrl())
}

if (process.env.TEST_DATABASE_URL) testDatabaseUrl()
