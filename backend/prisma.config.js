import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))

config({ path: envPath, quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
