import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'

export function buildApp({ equipamentoService, ...fastifyOptions } = {}) {
  const app = Fastify(fastifyOptions)

  app.setErrorHandler(errorHandler)

  app.get('/health', async () => ({ status: 'ok' }))

  if (equipamentoService) {
    app.register(equipamentoRoutes, {
      prefix: '/equipamentos',
      equipamentoService,
    })
  }

  return app
}
