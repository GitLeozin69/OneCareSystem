import { buildApp } from './app.js'
import { readRuntimeConfig } from './config/runtimeConfig.js'
import { createPrismaClient } from './lib/prisma.js'
import { securityLoggerOptions } from './plugins/security.js'
import { createAuthService } from './services/authService.js'
import { createDashboardService } from './services/dashboardService.js'
import { createEquipamentoService } from './services/equipamentoService.js'
import { createImportacaoService } from './services/importacaoService.js'
import { startNotificacaoScheduler } from './services/notificacaoScheduler.js'
import { createNotificacaoService } from './services/notificacaoService.js'
import { createUsuarioService } from './services/usuarioService.js'
import { installGracefulShutdown } from './utils/gracefulShutdown.js'
import { runBootstrap } from './utils/bootstrapError.js'

async function start() {
  const runtime = readRuntimeConfig()
  const prisma = createPrismaClient(runtime.databaseUrl)
  const equipamentoService = createEquipamentoService({ prisma })
  const notificacaoService = createNotificacaoService({ prisma })
  let stopNotificacaoScheduler

  const app = buildApp({
    logger: securityLoggerOptions(runtime.logLevel),
    trustProxy: runtime.trustProxy,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
    allowedHosts: runtime.allowedHosts,
    readinessCheck: () => prisma.$queryRaw`SELECT 1`,
    dashboardService: createDashboardService({ prisma }),
    equipamentoService,
    importacaoService: createImportacaoService({ prisma }),
    notificacaoService,
    authService: createAuthService({
      prisma, sessionDurationHours: runtime.security.sessionDurationHours,
    }),
    usuarioService: createUsuarioService({ prisma }),
    securityConfig: runtime.security,
  })

  app.addHook('onClose', async () => {
    stopNotificacaoScheduler?.()
    await prisma.$disconnect()
  })
  installGracefulShutdown({ app })

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
    await app.listen({ host: runtime.host, port: runtime.port })
    void runNotificacaoRoutine('startup')
    stopNotificacaoScheduler = startNotificacaoScheduler({ run: () => runNotificacaoRoutine('daily') })
  } catch (error) {
    app.log.error({ errorName: error.name, errorCode: error.code }, 'Falha ao iniciar o backend')
    await app.close().catch(() => {})
    throw error
  }
}

await runBootstrap(start)
