import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { testDatabaseUrl } from '../test/helpers/testDatabase.js'

const databaseUrl = testDatabaseUrl()
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy',
], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
  stdio: 'inherit',
})
if (result.error) process.stderr.write('Não foi possível executar o Prisma para o banco de teste.\n')
process.exitCode = result.status ?? 1
