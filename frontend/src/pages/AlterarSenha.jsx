import { useEffect, useRef, useState } from 'react'

import { useAuth } from '../auth/authState.js'
import Button from '../components/Button.jsx'

const fields = [
  ['senhaAtual', 'Senha atual', 'current-password'],
  ['novaSenha', 'Nova senha', 'new-password'],
  ['confirmacaoNovaSenha', 'Confirmar nova senha', 'new-password'],
]

export default function AlterarSenha({ onCancel }) {
  const { user, changeOwnPassword } = useAuth()
  const form = useRef(null)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = form.current
    element?.elements.namedItem('senhaAtual')?.focus()
    // Os valores ficam apenas nos inputs; reset também limpa ao sair da página.
    return () => element?.reset()
  }, [])

  if (!user?.ativo || user.role !== 'ADMIN') {
    return <p role="alert">Você não tem permissão para realizar esta ação.</p>
  }

  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    const element = event.currentTarget
    const payload = Object.fromEntries(fields.map(([name]) => [name, element.elements.namedItem(name).value]))
    lock.current = true
    setError('')
    try {
      if (fields.some(([name]) => !payload[name].trim() || payload[name].length > 128)) {
        setError('Preencha os três campos de senha, com até 128 caracteres.')
        return
      }
      if (payload.novaSenha.length < 8) {
        setError('A nova senha deve ter de 8 a 128 caracteres.')
        return
      }
      if (payload.novaSenha !== payload.confirmacaoNovaSenha) {
        setError('A confirmação deve ser igual à nova senha.')
        return
      }
      if (payload.novaSenha === payload.senhaAtual) {
        setError('A nova senha deve ser diferente da senha atual.')
        return
      }
      setBusy(true)
      await changeOwnPassword(payload)
    } catch (failure) {
      setError(failure.message)
    } finally {
      element.reset()
      for (const [name] of fields) payload[name] = ''
      lock.current = false
      setBusy(false)
    }
  }

  return <section className="panel mx-auto max-w-lg p-6 sm:p-8" aria-labelledby="password-title">
    <p className="eyebrow mb-2">CONTA DO ADMINISTRADOR</p>
    <h1 id="password-title" className="text-2xl font-semibold">Alterar minha senha</h1>
    <p id="password-hint" className="mt-3 text-sm text-slate-600">Use de 8 a 128 caracteres. Após salvar, todas as suas sessões serão encerradas e será necessário entrar novamente.</p>
    {error && <p id="password-error" role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <form ref={form} noValidate onSubmit={submit} aria-label="Alterar minha senha" aria-busy={busy} className="mt-6 space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <legend className="sr-only">Confirmação da senha atual e nova senha</legend>
        {fields.map(([name, label, autocomplete]) => <div key={name}>
          <label className="field-label" htmlFor={name}>{label}</label>
          <input id={name} name={name} className="input" type="password" required
            autoComplete={autocomplete} maxLength={128} minLength={name === 'senhaAtual' ? 1 : 8}
            aria-describedby={error ? 'password-error password-hint' : 'password-hint'} />
        </div>)}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Alterando…' : 'Confirmar alteração'}</Button>
        <Button disabled={busy} onClick={() => { form.current?.reset(); onCancel() }}>Cancelar</Button>
      </div>
      {busy && <p role="status">Alterando senha…</p>}
    </form>
  </section>
}
