import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não está configurada.')
  }

  const adapter = new PrismaMariaDb(databaseUrl)

  return new PrismaClient({ adapter })
}
