import { randomUUID } from 'node:crypto'

export const originalPassword = 'Senha ficticia inicial!'
export const changedPassword = ' Nova senha ficticia! '
export const passwordPayload = () => ({ senhaAtual: originalPassword,
  novaSenha: changedPassword, confirmacaoNovaSenha: changedPassword })

export function fakeAuthPrisma(senhaHash) {
  const now = new Date()
  const state = { users: [{ id: 1, username: 'admin.fixture', role: 'ADMIN', ativo: true,
    senhaHash, createdAt: now, updatedAt: now }], sessions: [] }
  function client(data) {
    return {
      usuario: {
        findUnique: async ({ where }) => structuredClone(data.users.find((u) =>
          where.id !== undefined ? u.id === where.id : u.username === where.username) ?? null),
        updateMany: async ({ where, data: changes }) => {
          const user = data.users.find((u) => u.id === where.id && u.ativo === where.ativo &&
            u.senhaHash === where.senhaHash && (!where.role || u.role === where.role))
          const condition = where.sessoes?.some
          if (!user || condition && !data.sessions.some((s) => s.usuarioId === user.id &&
            s.tokenHash === condition.tokenHash && s.expiresAt > condition.expiresAt.gt)) return { count: 0 }
          Object.assign(user, changes)
          return { count: 1 }
        },
      },
      sessao: {
        create: async ({ data: session }) => { data.sessions.push({ ...session, id: randomUUID() }) },
        findUnique: async ({ where }) => {
          const session = data.sessions.find((s) => s.tokenHash === where.tokenHash)
          return session ? { ...session, usuario: data.users.find((u) => u.id === session.usuarioId) } : null
        },
        deleteMany: async ({ where }) => {
          if (prisma.failDeletion) throw new Error('Falha simulada na revogação')
          const matches = (s, filter) => filter.usuarioId !== undefined ? s.usuarioId === filter.usuarioId
            : filter.tokenHash !== undefined ? s.tokenHash === filter.tokenHash
              : s.expiresAt <= filter.expiresAt.lte
          data.sessions = data.sessions.filter((s) => !(where.OR ?? [where]).some((filter) => matches(s, filter)))
        },
      },
    }
  }
  const prisma = {
    ...client(state), state,
    async $transaction(operation) {
      await prisma.beforeTransaction?.()
      const draft = structuredClone(state)
      const result = await operation(client(draft))
      Object.assign(state, draft)
      return result
    },
  }
  return prisma
}

export async function httpLogin(app, username, password, previousCookie = '') {
  const csrf = await app.inject({ url: '/auth/csrf', headers: previousCookie ? { cookie: previousCookie } : {} })
  const csrfCookie = csrf.headers['set-cookie']?.split(';')[0] ?? previousCookie.split(';')[0]
  const response = await app.inject({ method: 'POST', url: '/auth/login', headers: {
    origin: 'http://localhost:5173', cookie: [csrfCookie, previousCookie].filter(Boolean).join('; '),
    'x-csrf-token': csrf.json().csrfToken,
  }, payload: { username, password } })
  if (response.statusCode !== 200) return { response }
  const cookies = [response.headers['set-cookie']].flat()
  const sessionCookie = cookies.find((value) => value.startsWith('onecare_session=')).split(';')[0]
  return { response, token: sessionCookie.slice('onecare_session='.length), headers: {
    origin: 'http://localhost:5173', cookie: `${csrfCookie}; ${sessionCookie}`,
    'x-csrf-token': response.json().csrfToken,
  } }
}
