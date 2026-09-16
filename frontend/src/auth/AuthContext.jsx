import { useCallback, useEffect, useMemo, useState } from 'react'

import { authApi, configureApiSecurity } from '../services/api.js'
import { AuthContext } from './authState.js'

export function AuthProvider({ children, initialUser }) {
  const [user, setUser] = useState(initialUser ?? null)
  const [loading, setLoading] = useState(!initialUser)
  const [notice, setNotice] = useState('')
  const setCsrf = useCallback((token) => configureApiSecurity({ csrfToken: token }), [])

  useEffect(() => {
    configureApiSecurity({
      onUnauthorized: () => { setUser(null); setNotice('Sua sessão expirou. Entre novamente.') },
      onForbidden: () => setNotice('Você não tem permissão para realizar esta ação.'),
    })
    if (initialUser) {
      setCsrf('test-csrf-token')
      return undefined
    }
    const controller = new AbortController()
    authApi.me(controller.signal).then((result) => {
      setUser(result.user); setCsrf(result.csrfToken)
    }).catch(async (error) => {
      if (error.name === 'AbortError') return
      setUser(null)
      const result = await authApi.csrf(controller.signal).catch(() => null)
      if (result) setCsrf(result.csrfToken)
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [initialUser, setCsrf])

  const login = useCallback(async (credentials) => {
    const result = await authApi.login(credentials)
    setCsrf(result.csrfToken); setUser(result.user); setNotice('')
  }, [setCsrf])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch (error) {
      if (error.status !== 401) {
        setNotice('Não foi possível encerrar a sessão. Verifique a conexão e tente sair novamente.')
      }
      return
    }
    setUser(null); setCsrf(''); setNotice('')
    const result = await authApi.csrf().catch(() => null)
    if (result) setCsrf(result.csrfToken)
  }, [setCsrf])

  const changeOwnPassword = useCallback(async (payload) => {
    await authApi.changeOwnPassword(payload)
    setCsrf(''); setUser(null); setLoading(true)
    setNotice('Senha alterada com sucesso. Todas as sessões foram encerradas. Entre com a nova senha.')
    try {
      const result = await authApi.csrf().catch(() => null)
      if (result) setCsrf(result.csrfToken)
    } finally { setLoading(false) }
  }, [setCsrf])

  const value = useMemo(() => ({ user, loading, notice, setNotice, login, logout, changeOwnPassword }),
    [user, loading, notice, login, logout, changeOwnPassword])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
