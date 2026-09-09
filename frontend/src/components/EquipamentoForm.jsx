import { useEffect, useRef, useState } from 'react'
import { equipamentosApi } from '../services/api.js'
import { fields, prepareEquipment, toFormValues } from '../utils/equipamento.js'
import Button from './Button.jsx'

export default function EquipamentoForm({ id, onCancel, onSaved, onHistory }) {
  const [values, setValues] = useState(() => toFormValues())
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingLock = useRef(false)
  const title = useRef(null)
  const form = useRef(null)

  useEffect(() => { title.current?.focus() }, [])
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    let active = true
    equipamentosApi.get(id, controller.signal).then(({ item }) => {
      if (active) setValues(toFormValues(item))
    }).catch((failure) => {
      if (active && failure.name !== 'AbortError') setLoadError(failure)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [id, attempt])

  function retry() {
    setLoading(true)
    setLoadError(null)
    setAttempt((value) => value + 1)
  }

  function focusError(fieldErrors) {
    const first = fields.find(({ name }) => fieldErrors[name])
    if (first) form.current?.elements.namedItem(first.name)?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    if (savingLock.current) return
    const { payload, errors: validation } = prepareEquipment(values)
    setErrors(validation)
    setError('')
    if (Object.keys(validation).length) {
      focusError(validation)
      return
    }
    savingLock.current = true
    setSaving(true)
    try {
      if (id) await equipamentosApi.update(id, payload)
      else await equipamentosApi.create(payload)
      onSaved(id ? 'Equipamento atualizado com sucesso.' : 'Equipamento cadastrado com sucesso.')
    } catch (failure) {
      setErrors(failure.fields ?? {})
      setError(failure.message)
      focusError(failure.fields ?? {})
    } finally {
      savingLock.current = false
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="form-title">
      <Button onClick={onCancel} disabled={saving} className="mb-6">← Voltar para equipamentos</Button>
      <div className="panel overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <p className="eyebrow mb-2">CADASTRO DE EQUIPAMENTOS</p>
          <h1 id="form-title" ref={title} tabIndex={-1} className="text-2xl font-semibold tracking-tight">{id ? 'Editar equipamento' : 'Novo equipamento'}</h1>
          <p className="mt-2 text-sm text-slate-600">Campos com * são obrigatórios. Os demais são opcionais.</p>
        </div>
        {loading ? <p role="status" className="p-8">Carregando equipamento…</p> : loadError ? (
          <div className="space-y-4 p-8">
            <p role="alert">{loadError.message}</p>
            {loadError.status !== 404 && <Button onClick={retry}>Tentar novamente</Button>}
          </div>
        ) : (
          <form ref={form} noValidate onSubmit={submit} aria-label={id ? 'Editar equipamento' : 'Novo equipamento'}>
            <fieldset disabled={saving} className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
              <legend className="sr-only">Dados do equipamento e do contrato</legend>
              {fields.map((field) => (
                <div key={field.name} className={field.name === 'cliente' ? 'sm:col-span-2' : ''}>
                  <label htmlFor={field.name} className="field-label">{field.label}{field.required ? ' *' : ' (opcional)'}</label>
                  <input
                    className="input" id={field.name} name={field.name}
                    type={field.type ?? 'text'} required={field.required}
                    maxLength={field.maxLength} value={values[field.name]}
                    aria-invalid={Boolean(errors[field.name])}
                    aria-describedby={errors[field.name] ? `${field.name}-error` : field.name === 'serialNumber' ? 'serial-hint' : undefined}
                    onChange={(event) => {
                      const value = field.name === 'serialNumber' ? event.target.value.toUpperCase() : event.target.value
                      setValues((current) => ({ ...current, [field.name]: value }))
                      setErrors((current) => ({ ...current, [field.name]: undefined }))
                    }}
                  />
                  {field.name === 'serialNumber' && <p id="serial-hint" className="mt-1.5 text-xs text-slate-500">Apenas letras e números. Deve ser único.</p>}
                  {errors[field.name] && <p id={`${field.name}-error`} className="mt-1.5 text-sm text-red-700">{errors[field.name]}</p>}
                </div>
              ))}
            </fieldset>
            {error && <p role="alert" className="mx-6 mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800 sm:mx-8">{error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
              {saving && <span role="status" className="mr-auto text-sm text-slate-600">Salvando equipamento…</span>}
              {id && <Button onClick={onHistory} disabled={saving}>Ver histórico</Button>}
              <Button onClick={onCancel} disabled={saving}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar equipamento'}</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
