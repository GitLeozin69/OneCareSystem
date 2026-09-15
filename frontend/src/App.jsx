import { useCallback, useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Equipamentos from './pages/Equipamentos.jsx'
import Notificacoes from './pages/Notificacoes.jsx'
import Login from './pages/Login.jsx'
import Usuarios from './pages/Usuarios.jsx'
import AlterarSenha from './pages/AlterarSenha.jsx'
import { notificacoesApi } from './services/api.js'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/authState.js'

function AppContent() {
  const { user, loading, notice, logout } = useAuth()
  const [destination, setDestination] = useState({ page: 'equipamentos' })
  const [unreadCount, setUnreadCount] = useState(0)

  const updateUnreadCount = useCallback((value) => {
    setUnreadCount(Number.isInteger(value) && value >= 0 ? value : 0)
  }, [])

  useEffect(() => {
    if (user?.role !== 'ADMIN') return undefined
    const controller = new AbortController()
    notificacoesApi.unreadCount(controller.signal)
      .then(({ unreadCount: count }) => updateUnreadCount(count))
      .catch(() => {})
    return () => controller.abort()
  }, [updateUnreadCount, user?.role])

  function showEquipamentos(mode = 'active', status = '') {
    setDestination({ page: 'equipamentos', mode, status })
  }

  if (loading) return <main className="grid min-h-screen place-items-center"><p role="status">Verificando sessão…</p></main>
  if (!user) return <Login />
  const admin = user.role === 'ADMIN'

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4">Pular para o conteúdo</a>
      <header className="border-b border-[#203a34] bg-[#294740] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 py-5 sm:px-10">
          <img src="/logo-onecare.png" alt="Inteligência em Negócios" className="size-16 shrink-0 object-contain" />
          <div className="mr-auto"><span className="text-lg font-semibold tracking-tight">RW Inteligência em Negócios</span><p className="text-xs text-emerald-50/80">Gestão de equipamentos</p></div>
          <nav aria-label="Navegação principal" className="flex gap-2">
            <button type="button" className="btn header-btn" aria-current={destination.page === 'dashboard' ? 'page' : undefined} onClick={() => setDestination({ page: 'dashboard' })}>Dashboard</button>
            <button type="button" className="btn header-btn" aria-current={destination.page === 'equipamentos' ? 'page' : undefined} onClick={() => showEquipamentos()}>Equipamentos</button>
            {admin && <button type="button" className="btn header-btn gap-2" aria-current={destination.page === 'notificacoes' ? 'page' : undefined} aria-label={`Notificações, ${unreadCount} não lida${unreadCount === 1 ? '' : 's'}`} onClick={() => setDestination({ page: 'notificacoes' })}><span aria-hidden="true">🔔</span> Notificações {unreadCount > 0 && <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-white">{unreadCount}</span>}</button>}
            {admin && <button type="button" className="btn header-btn" aria-current={destination.page === 'usuarios' ? 'page' : undefined} onClick={() => setDestination({ page: 'usuarios' })}>Usuários</button>}
            {admin && <button type="button" className="btn header-btn" aria-current={destination.page === 'senha' ? 'page' : undefined} onClick={() => setDestination({ page: 'senha' })}>Alterar minha senha</button>}
            <span className="self-center px-2 text-xs text-emerald-50/80">{user.username} · {admin ? 'Administrador' : 'Visualizador'}</span>
            <button type="button" className="btn header-btn" onClick={logout}>Sair</button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10 sm:py-10">
        {notice && <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
        {destination.page === 'dashboard' && <Dashboard onNavigate={showEquipamentos} />}
        {destination.page === 'equipamentos' && <Equipamentos canManage={admin} key={`${destination.mode}-${destination.status}`} initialMode={destination.mode} initialStatus={destination.status} />}
        {admin && destination.page === 'notificacoes' && <Notificacoes onUnreadCountChange={updateUnreadCount} />}
        {admin && destination.page === 'usuarios' && <Usuarios />}
        {admin && destination.page === 'senha' && <AlterarSenha onCancel={() => showEquipamentos()} />}
      </main>
    </>
  )
}

export default function App({ initialUser }) {
  return <AuthProvider initialUser={initialUser}><AppContent /></AuthProvider>
}
