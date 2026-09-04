import { buildApp } from './app.js'
import { createPrismaClient } from './lib/prisma.js'
import { createEquipamentoService } from './services/equipamentoService.js'

const prisma = createPrismaClient()
const equipamentoService = createEquipamentoService({ prisma })
const app = buildApp({ logger: true, equipamentoService })
const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
