import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'
import { importacaoRoutes } from './routes/importacaoRoutes.js'
import { notificacaoRoutes } from './routes/notificacaoRoutes.js'

export function buildApp({ dashboardService, equipamentoService, importacaoService, importacaoLimits,
  notificacaoService, ...fastifyOptions } = {}) {
  const app = Fastify(fastifyOptions)

  app.setErrorHandler(errorHandler)

  app.get('/health', async () => ({ status: 'ok' }))

  if (dashboardService) {
    app.register(dashboardRoutes, { prefix: '/dashboard', dashboardService })
  }

  if (equipamentoService) {
    app.register(equipamentoRoutes, {
      prefix: '/equipamentos',
      equipamentoService,
    })
  }

  if (importacaoService) app.register(importacaoRoutes, {
    prefix: '/equipamentos/importacao', importacaoService, limits: importacaoLimits,
  })

  if (notificacaoService) app.register(notificacaoRoutes, {
    prefix: '/notificacoes', notificacaoService,
  })

  return app
}
