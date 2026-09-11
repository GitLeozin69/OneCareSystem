import { SESSION_COOKIE } from '../services/authService.js'
import { sessionCookieOptions } from '../plugins/security.js'

const credentialsSchema = {
  type: 'object', additionalProperties: false, required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 50 },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
}

export async function authRoutes(app, { authService, securityConfig }) {
  app.get('/csrf', { config: { access: 'PUBLIC' } }, async (_request, reply) => ({
    csrfToken: await reply.generateCsrf(),
  }))

  app.post('/login', {
    config: { access: 'PUBLIC' }, schema: { body: credentialsSchema },
  }, async (request, reply) => {
    const result = await authService.login({ ...request.body, ip: request.ip })
    reply.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(securityConfig, result.expiresAt))
    request.log.info({ userId: result.user.id }, 'Login realizado')
    return { user: result.user, csrfToken: await reply.generateCsrf() }
  })

  app.get('/me', async (request, reply) => ({
    user: request.authUser,
    csrfToken: await reply.generateCsrf(),
  }))

  app.post('/logout', { config: { access: 'PUBLIC' } }, async (request, reply) => {
    await authService.logout(request.cookies[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(securityConfig))
    return { success: true }
  })
}
