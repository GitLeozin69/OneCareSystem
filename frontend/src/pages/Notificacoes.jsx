import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import EquipamentoDetalhes from '../components/EquipamentoDetalhes.jsx'
import OnecareStatus from '../components/OnecareStatus.jsx'
import { equipamentosApi, notificacoesApi } from '../services/api.js'
import { formatDateTime } from '../utils/equipamento.js'

const filters = [
  { label: 'Todas', value: undefined },
  { label: 'Não lidas', value: false },
  { label: 'Lidas', value: true },
]

export default function Notificacoes({ onUnreadCountChange }) {
  const [query, setQuery] = useState({ page: 1, limit: 20, lida: undefined })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    notificacoesApi.list(query, controller.signal).then((response) => {
      if (!active) return
      setResult(response)
      onUnreadCountChange(response.unreadCount)
      if (response.pagination.totalPages > 0 && query.page > response.pagination.totalPages) {
        setQuery((current) => ({ ...current, page: response.pagination.totalPages }))
      }
    }).catch((requestError) => {
      if (active && requestError.name !== 'AbortError') setError(requestError.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      controller.abort()
    }
  }, [query, revision, onUnreadCountChange])

  function refresh() {
    setError('')
    setLoading(true)
    setRevision((value) => value + 1)
  }

  function changeQuery(changes) {
    setError('')
    setLoading(true)
    setQuery((current) => ({ ...current, ...changes }))
  }

  async function markRead(id) {
    setBusy(true)
    setError('')
    try {
      await notificacoesApi.markRead(id)
      refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function markAllRead() {
    setBusy(true)
    setError('')
    try {
      await notificacoesApi.markAllRead()
      refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function showDetails(id) {
    setBusy(true)
    setError('')
    try {
      const response = await equipamentosApi.get(id)
      setDetails(response.item)
    } catch (requestError) {
      setError(requestError.status === 404
        ? 'O equipamento não está mais disponível para consulta.'
        : requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (details) {
    return <EquipamentoDetalhes equipamento={details} onBack={() => setDetails(null)} />
  }

  return (
    <section aria-labelledby="notifications-title" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">ACOMPANHAMENTO</p><h1 id="notifications-title" className="text-3xl font-semibold tracking-tight">Notificações</h1><p className="mt-2 text-sm text-slate-600">Avisos internos de vencimento dos contratos OneCare.</p></div>
        <div className="flex gap-2">
          <Button disabled={busy || loading || !result?.unreadCount} onClick={markAllRead}>Marcar todas como lidas</Button>
          <Button disabled={busy || loading} onClick={refresh}>Atualizar</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Filtrar notificações">
        {filters.map((filter) => <Button key={filter.label} variant={query.lida === filter.value ? 'primary' : 'secondary'} aria-pressed={query.lida === filter.value} onClick={() => changeQuery({ page: 1, lida: filter.value })}>{filter.label}</Button>)}
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {loading && <p role="status" className="panel p-6 text-sm text-slate-600">Carregando notificações...</p>}
      {!loading && result?.data.length === 0 && <div className="panel p-8 text-center"><h2 className="font-semibold">Nenhuma notificação encontrada</h2><p className="mt-2 text-sm text-slate-600">Não há avisos que correspondam ao filtro selecionado.</p></div>}

      {!loading && result?.data.length > 0 && <ul className="space-y-3">
        {result.data.map((notification) => <li key={notification.id} className={`panel p-5 ${notification.lida ? '' : 'border-l-4 border-l-teal-700'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-teal-800">{notification.tipo === 'ONECARE_VENCIDO' ? 'OneCare vencido' : 'OneCare vencendo'}</span><span className="text-xs text-slate-500">{notification.lida ? 'Lida' : 'Não lida'}</span></div>
              <p className="mt-2 font-medium text-slate-900">{notification.mensagem}</p>
              <p className="mt-1 text-xs text-slate-500">Criada em {formatDateTime(notification.createdAt)}</p>
              {notification.equipamento && <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><p className="text-sm font-semibold">Serial {notification.equipamento.serialNumber}</p><p className="mt-1 text-xs text-slate-600">{notification.equipamento.cliente} · {notification.equipamento.partNumber}</p>{notification.equipamento.patrimonio && <p className="mt-1 text-xs text-slate-600">Patrimônio {notification.equipamento.patrimonio}</p>}</div>
                <OnecareStatus status={notification.equipamento.statusOnecare} diasRestantes={notification.equipamento.diasRestantes} />
              </div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!notification.lida && <Button disabled={busy} onClick={() => markRead(notification.id)}>Marcar como lida</Button>}
              {notification.equipamento && !notification.equipamento.arquivado
                ? <Button disabled={busy} onClick={() => showDetails(notification.equipamento.id)}>Ver equipamento</Button>
                : <span className="self-center text-xs text-slate-500">{notification.equipamento ? 'Equipamento arquivado' : 'Equipamento indisponível'}</span>}
            </div>
          </div>
        </li>)}
      </ul>}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{result ? `${result.pagination.total} notificação(ões) · Página ${result.pagination.page} de ${result.pagination.totalPages}` : 'Aguardando resultados'}</p>
        <div className="flex gap-2"><Button disabled={busy || loading || !result || query.page <= 1} onClick={() => changeQuery({ page: query.page - 1 })}>← Anterior</Button><Button disabled={busy || loading || !result || query.page >= result.pagination.totalPages} onClick={() => changeQuery({ page: query.page + 1 })}>Próxima →</Button></div>
      </footer>
    </section>
  )
}
