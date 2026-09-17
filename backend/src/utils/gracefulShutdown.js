export function installGracefulShutdown({ app, processRef = process, timeoutMs = 10_000 }) {
  let shuttingDown = false

  async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'Encerramento gracioso iniciado')
    let timer
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('SHUTDOWN_TIMEOUT')), timeoutMs)
          timer.unref?.()
        }),
      ])
      processRef.exit(0)
    } catch (error) {
      app.log.error({ signal, errorCode: error.message === 'SHUTDOWN_TIMEOUT' ? 'SHUTDOWN_TIMEOUT' : undefined },
        'Falha ao encerrar o backend no prazo')
      processRef.exit(1)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const onSigterm = () => void shutdown('SIGTERM')
  const onSigint = () => void shutdown('SIGINT')
  processRef.once('SIGTERM', onSigterm)
  processRef.once('SIGINT', onSigint)

  return () => {
    processRef.removeListener('SIGTERM', onSigterm)
    processRef.removeListener('SIGINT', onSigint)
  }
}
