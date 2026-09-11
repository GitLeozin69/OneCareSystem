import Fastify from 'fastify'

import { errorHandler } from './middlewares/errorHandler.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { equipamentoRoutes } from './routes/equipamentoRoutes.js'
import { importacaoRoutes } from './routes/importacaoRoutes.js'
import { notificacaoRoutes } from './routes/notificacaoRoutes.js'
import { authRoutes } from './routes/authRoutes.js'
import { usuarioRoutes } from './routes/usuarioRoutes.js'
import { registerSecurity } from './plugins/security.js'

export function buildApp({ dashboardService, equipamentoService, importacaoService, importacaoLimits,
  notificacaoService, authService, usuarioService, securityConfig, ...fastifyOptions } = {}) {
  const app = Fastify(fastifyOptions)

  app.setErrorHandler(errorHandler)

  function registerApplicationRoutes(instance, secured = false) {
    instance.get('/health', { config: { access: 'PUBLIC' } }, async () => ({ status: 'ok' }))

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
