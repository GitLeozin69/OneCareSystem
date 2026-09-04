import Fastify from 'fastify'

export function buildApp(options = {}) {
  const app = Fastify(options)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
