import { buildApp } from './app.js'

const app = buildApp({ logger: true })
const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
