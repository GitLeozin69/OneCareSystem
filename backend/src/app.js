import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'
import { importacaoRoutes } from './routes/importacaoRoutes.js'
import { notificacaoRoutes } from './routes/notificacaoRoutes.js'
import { authRoutes } from './routes/authRoutes.js'
import { usuarioRoutes } from './routes/usuarioRoutes.js'
import { registerSecurity } from './plugins/security.js'
import { requestHostIsAllowed } from './config/runtimeConfig.js'

export function buildApp({ dashboardService, equipamentoService, importacaoService, importacaoLimits,
  notificacaoService, authService, usuarioService, securityConfig,
  allowedHosts, readinessCheck, readinessTimeoutMs = 2_000,
  runtimeEnv = process.env.NODE_ENV, ...fastifyOptions } = {}) {
  const hasApplicationServices = dashboardService || equipamentoService || importacaoService ||
    notificacaoService || usuarioService
  if (!authService && runtimeEnv === 'production' && hasApplicationServices) {
    throw new Error('Autenticação é obrigatória em produção.')
  }

  const app = Fastify({
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    frameworkErrors: errorHandler,
    ...fastifyOptions,
  })
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({
    error: 'ROTA_NAO_ENCONTRADA', message: 'Rota não encontrada.', details: [],
  }))
  app.addHook('onRequest', async (request, reply) => {
    if (!requestHostIsAllowed(request.headers.host, allowedHosts)) {
      return reply.code(400).send({
        error: 'HOST_NAO_PERMITIDO', message: 'Host não permitido.', details: [],
      })
    }
  })

  function registerApplicationRoutes(instance, secured = false) {
    instance.get('/health', {
      config: { access: 'PUBLIC', rateLimit: false }, logLevel: 'silent',
    }, async () => ({ status: 'ok' }))
    instance.get('/ready', {
      config: { access: 'PUBLIC', rateLimit: false }, logLevel: 'silent',
    }, async (_request, reply) => {
      if (!readinessCheck) return { status: 'ready' }
      let timer
      try {
        await Promise.race([
          readinessCheck(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), readinessTimeoutMs)
            timer.unref?.()
          }),
        ])
        return { status: 'ready' }
      } catch {
        return reply.code(503).send({ status: 'not_ready' })
      } finally {
        if (timer) clearTimeout(timer)
      }
    })

    if (secured) {
      instance.register(authRoutes, { prefix: '/auth', authService, securityConfig })
      instance.register(usuarioRoutes, { prefix: '/usuarios', usuarioService })
    }

    if (dashboardService) {
      instance.register(dashboardRoutes, { prefix: '/dashboard', dashboardService })
    }

    if (equipamentoService) {
      instance.register(equipamentoRoutes, {
        prefix: '/equipamentos', equipamentoService,
      })
    }

    if (importacaoService) instance.register(importacaoRoutes, {
      prefix: '/equipamentos/importacao', importacaoService, limits: importacaoLimits,
    })

    if (notificacaoService) instance.register(notificacaoRoutes, {
      prefix: '/notificacoes', notificacaoService,
    })
  }

  if (authService) {
    if (!usuarioService || !securityConfig) throw new Error('Serviços de autenticação incompletos.')
    app.register(async (securedApp) => {
      await registerSecurity(securedApp, { authService, config: securityConfig })
      registerApplicationRoutes(securedApp, true)
    })
  } else registerApplicationRoutes(app)

  return app
}
