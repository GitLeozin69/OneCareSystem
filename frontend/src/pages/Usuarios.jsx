import { useEffect, useState } from 'react'

import Button from '../components/Button.jsx'
import { usuariosApi } from '../services/api.js'

export default function Usuarios() {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [resetUser, setResetUser] = useState(null)
  const [resetPassword, setResetPassword] = useState('')

  async function load(signal) {
    setLoading(true)
    try { setUsers((await usuariosApi.list(signal)).data); setError('') }
    catch (caught) { if (caught.name !== 'AbortError') setError(caught.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [])

  async function action(operation, message) {
    setError(''); setNotice('')
    try { await operation(); setNotice(message); await load() } catch (caught) { setError(caught.message) }
  }

  return <section aria-labelledby="users-title">
    <p className="eyebrow mb-2">ADMINISTRAÇÃO</p><h1 id="users-title" className="text-3xl font-semibold">Usuários</h1>
    <p className="mt-3 text-sm text-slate-600">Crie e gerencie contas individuais de visualização.</p>
    {notice && <p role="status" className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">{notice}</p>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <form className="panel mt-7 grid gap-4 p-6 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={async (event) => {
      event.preventDefault()
      await action(() => usuariosApi.create({ username, password }), 'Visualizador criado com sucesso.')
      setUsername(''); setPassword('')
    }}>
      <div><label className="field-label" htmlFor="new-username">Novo usuário</label><input className="input" id="new-username" required value={username} onChange={(event) => setUsername(event.target.value)} /></div>
      <div><label className="field-label" htmlFor="new-password">Senha inicial</label><input className="input" id="new-password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <Button type="submit" variant="primary">Criar visualizador</Button>
    </form>
    <div className="panel mt-6 overflow-x-auto">
      {loading ? <p role="status" className="p-8">Carregando usuários…</p> : <table className="w-full text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-4">Usuário</th><th className="p-4">Perfil</th><th className="p-4">Status</th><th className="p-4">Ações</th></tr></thead><tbody className="divide-y">
        {users.map((user) => <tr key={user.id}><th className="p-4">{user.username}</th><td className="p-4">{user.role === 'ADMIN' ? 'Administrador' : 'Visualizador'}</td><td className="p-4">{user.ativo ? 'Ativo' : 'Inativo'}</td><td className="p-4"><div className="flex flex-wrap gap-2">
          {user.role !== 'ADMIN' && <><Button onClick={() => {
            if (window.confirm(`${user.ativo ? 'Desativar' : 'Ativar'} ${user.username}?`)) action(() => usuariosApi.setStatus(user.id, !user.ativo), `Usuário ${user.ativo ? 'desativado' : 'ativado'}.`)
          }}>{user.ativo ? 'Desativar' : 'Ativar'}</Button><Button onClick={() => { setResetUser(user); setResetPassword('') }}>Redefinir senha</Button></>}
        </div></td></tr>)}
      </tbody></table>}
    </div>
    {resetUser && <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"><form className="panel w-full max-w-md p-6" onSubmit={async (event) => {
      event.preventDefault()
      if (!window.confirm(`Redefinir a senha de ${resetUser.username} e encerrar todas as sessões dessa conta?`)) return
      await action(() => usuariosApi.resetPassword(resetUser.id, resetPassword), 'Senha redefinida e sessões encerradas.')
      setResetUser(null); setResetPassword('')
    }}><h2 id="reset-title" className="text-xl font-semibold">Redefinir senha de {resetUser.username}</h2><p className="mt-2 text-sm text-slate-600">Todas as sessões dessa conta serão encerradas.</p><div className="mt-5"><label className="field-label" htmlFor="reset-password">Nova senha</label><input className="input" id="reset-password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></div><div className="mt-6 flex gap-3"><Button type="submit" variant="primary">Confirmar redefinição</Button><Button onClick={() => setResetUser(null)}>Cancelar</Button></div></form></div>}
  </section>
}
