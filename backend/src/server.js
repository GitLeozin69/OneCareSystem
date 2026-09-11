import { buildApp } from './app.js'
import { createPrismaClient } from './lib/prisma.js'
import { createDashboardService } from './services/dashboardService.js'
import { createEquipamentoService } from './services/equipamentoService.js'
import { createImportacaoService } from './services/importacaoService.js'
import { startNotificacaoScheduler } from './services/notificacaoScheduler.js'
import { createNotificacaoService } from './services/notificacaoService.js'

const prisma = createPrismaClient()
const equipamentoService = createEquipamentoService({ prisma })
const dashboardService = createDashboardService({ prisma })
const notificacaoService = createNotificacaoService({ prisma })
const app = buildApp({
  logger: true,
  dashboardService,
  equipamentoService,
  importacaoService: createImportacaoService({ prisma }),
  notificacaoService,
})
const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

let stopNotificacaoScheduler

app.addHook('onClose', async () => {
  stopNotificacaoScheduler?.()
  await prisma.$disconnect()
})

async function runNotificacaoRoutine(origin) {
  app.log.info({ origin }, 'Iniciando rotina de notificações OneCare')
  try {
    const summary = await notificacaoService.processExpirations()
    app.log.info({ origin, ...summary }, 'Rotina de notificações OneCare concluída')
  } catch (error) {
    app.log.error({ origin, errorName: error.name, errorCode: error.code },
      'Falha na rotina de notificações OneCare')
  }
}

try {
  await prisma.$connect()
  await app.listen({ host, port })
  void runNotificacaoRoutine('startup')
  stopNotificacaoScheduler = startNotificacaoScheduler({
    run: () => runNotificacaoRoutine('daily'),
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
