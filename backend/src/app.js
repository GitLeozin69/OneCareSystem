import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'
import { importacaoRoutes } from './routes/importacaoRoutes.js'

export function buildApp({ dashboardService, equipamentoService, importacaoService, importacaoLimits, ...fastifyOptions } = {}) {
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

  return app
}
