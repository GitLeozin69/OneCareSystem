import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'
import { importacaoRoutes } from './routes/importacaoRoutes.js'

export function buildApp({ equipamentoService, importacaoService, importacaoLimits, ...fastifyOptions } = {}) {
  const app = Fastify(fastifyOptions)

  app.setErrorHandler(errorHandler)

  app.get('/health', async () => ({ status: 'ok' }))

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
