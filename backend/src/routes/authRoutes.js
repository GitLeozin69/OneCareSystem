import { SESSION_COOKIE } from '../services/authService.js'
import { csrfUserInfo, sessionCookieOptions } from '../plugins/security.js'
import { passwordChangeError, validatePasswordChange } from '../utils/passwordChangeValidation.js'

const credentialsSchema = {
  type: 'object', additionalProperties: false, required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 50 },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
}

export async function authRoutes(app, { authService, securityConfig }) {
  app.patch('/senha', {
    config: { access: 'ADMIN', rateLimit: {
      max: 5, windowMs: 15 * 60 * 1000, name: 'own-password-change',
    } },
    // Validação explícita evita a coerção automática de números/arrays para strings.
    preValidation: async (request) => {
      if (Object.keys(request.query).length) {
        throw passwordChangeError('REQUISICAO_INVALIDA', 'Envie as senhas somente no corpo JSON da requisição.')
      }
      validatePasswordChange(request.body)
    },
  }, async (request, reply) => {
    await authService.changeOwnPassword(request.authUser.id, request.cookies[SESSION_COOKIE], request.body)
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(securityConfig))
    reply.clearCookie('onecare_csrf', sessionCookieOptions(securityConfig))
    request.log.info({ userId: request.authUser.id }, 'Senha própria alterada; sessões revogadas')
    return reply.code(204).send()
  })

  app.get('/csrf', { config: { access: 'PUBLIC' } }, async (request, reply) => ({
    csrfToken: await reply.generateCsrf({
      userInfo: csrfUserInfo(request.cookies[SESSION_COOKIE]),
    }),
  }))

  app.post('/login', {
    config: { access: 'PUBLIC' }, schema: { body: credentialsSchema },
  }, async (request, reply) => {
    const result = await authService.login({
      ...request.body,
      ip: request.ip,
      previousToken: request.cookies[SESSION_COOKIE],
    })
    reply.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(securityConfig, result.expiresAt))
    request.log.info({ userId: result.user.id }, 'Login realizado')
    return {
      user: result.user,
      csrfToken: await reply.generateCsrf({ userInfo: csrfUserInfo(result.token) }),
    }
  })

  app.get('/me', async (request, reply) => ({
    user: request.authUser,
    csrfToken: await reply.generateCsrf({
      userInfo: csrfUserInfo(request.cookies[SESSION_COOKIE]),
    }),
  }))

  app.post('/logout', { config: { access: 'PUBLIC' } }, async (request, reply) => {
    await authService.logout(request.cookies[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(securityConfig))
    return { success: true }
  })
}
