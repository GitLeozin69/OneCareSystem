import { runBootstrap } from '../src/utils/bootstrapError.js'

await runBootstrap(async () => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
    throw new Error('O script start aceita somente NODE_ENV=production.')
  }
  process.env.NODE_ENV = 'production'
  await import('../src/server.js')
})
