import { useState } from 'react'

import Button from '../components/Button.jsx'
import { useAuth } from '../auth/authState.js'

export default function Login() {
  const { login, notice } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return <main className="grid min-h-screen place-items-center bg-[#162b26] px-5">
    <section className="panel w-full max-w-md p-8" aria-labelledby="login-title">
      <img src="/logo-onecare.png" alt="RW Inteligência em Negócios" className="mx-auto mb-5 size-24 object-contain" />
      <h1 id="login-title" className="text-3xl font-semibold">Entrar</h1>
      <p className="mt-2 text-sm text-slate-600">Use sua conta individual para acessar o sistema.</p>
      {notice && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <form className="mt-6 space-y-5" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError('')
        try { await login({ username, password }) } catch (caught) { setError(caught.message) } finally { setPassword(''); setBusy(false) }
      }}>
        <div><label className="field-label" htmlFor="username">Usuário</label><input className="input" id="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></div>
        <div><label className="field-label" htmlFor="password">Senha</label><input className="input" id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
    </section>
  </main>
}
