import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button.jsx'
import DashboardCard from '../components/DashboardCard.jsx'
import DashboardEquipmentList from '../components/DashboardEquipmentList.jsx'
import EquipamentoDetalhes from '../components/EquipamentoDetalhes.jsx'
import { dashboardApi, equipamentosApi } from '../services/api.js'
import { formatDateTime } from '../utils/equipamento.js'

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(true)
  const [revision, setRevision] = useState(0)
  const [details, setDetails] = useState(null)
  const [detailsError, setDetailsError] = useState('')
  const requestLock = useRef(false)
  const title = useRef(null)
  const loading = !data && !error

  useEffect(() => {
    const controller = new AbortController()
    requestLock.current = true
    dashboardApi.summary(controller.signal).then((result) => {
      setData(result)
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError(requestError.message)
    }).finally(() => {
      requestLock.current = false
      setRefreshing(false)
    })
    return () => controller.abort()
  }, [revision])

  useEffect(() => { title.current?.focus() }, [])

  function refresh() {
    if (requestLock.current) return
    setRefreshing(true)
    setError('')
    setRevision((value) => value + 1)
  }

  async function openDetails(item) {
    setDetails({ loading: true, item })
    setDetailsError('')
    try {
      const result = await equipamentosApi.get(item.id)
      setDetails({ item: result.item })
    } catch (requestError) {
      setDetails(null)
      setDetailsError(requestError.message)
    }
  }

  if (details?.item && !details.loading) {
    return <EquipamentoDetalhes equipamento={details.item} onBack={() => setDetails(null)} />
  }

  const totals = data?.totals
  return (
    <section aria-labelledby="dashboard-title" aria-busy={loading || details?.loading || undefined}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2">VISÃO OPERACIONAL</p>
          <h1 id="dashboard-title" ref={title} tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard OneCare</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Acompanhe coberturas e vencimentos dos equipamentos não arquivados.</p>
        </div>
        <Button variant="primary" disabled={refreshing} onClick={refresh}>{refreshing ? 'Atualizando…' : 'Atualizar dashboard'}</Button>
      </div>

      {details?.loading && <p role="status" className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-4">Carregando detalhes…</p>}
      {detailsError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">{detailsError}</p>}
      {error && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4"><p role="alert" className="text-sm text-red-800">{error}</p><Button onClick={refresh}>Tentar novamente</Button></div>}
      {loading && <p role="status" className="panel px-6 py-16 text-center text-slate-600">Carregando dashboard…</p>}

      {data && <div className="space-y-7">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <DashboardCard title="Total de equipamentos" value={totals.totalEquipamentos} tone="blue" onClick={() => onNavigate('active', '')} />
          <DashboardCard title="OneCare ativo" value={totals.onecareAtivo} tone="green" onClick={() => onNavigate('active', 'ATIVO')} />
          <DashboardCard title="Vencendo" value={totals.onecareVencendo} tone="amber" onClick={() => onNavigate('active', 'VENCENDO')} />
          <DashboardCard title="Vencido" value={totals.onecareVencido} tone="red" onClick={() => onNavigate('expired', 'VENCIDO')} />
          <DashboardCard title="Sem data de término" value={totals.semDataTermino} tone="gray" />
          <DashboardCard title="Arquivados" value={totals.arquivados} tone="dark" onClick={() => onNavigate('archived', '')} />
        </div>
        {totals.totalEquipamentos === 0 && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">Nenhum equipamento operacional cadastrado.</p>}
        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardEquipmentList id="upcoming-title" title="Próximos vencimentos" items={data.proximosVencimentos} emptyMessage="Nenhum equipamento próximo do vencimento." onView={openDetails} />
          <DashboardEquipmentList id="recently-expired-title" title="Vencidos recentemente" items={data.vencidosRecentes} emptyMessage="Nenhum equipamento vencido encontrado." onView={openDetails} />
        </div>
        <p className="text-right text-xs text-slate-500">Atualizado em {formatDateTime(data.generatedAt)}.</p>
      </div>}
    </section>
  )
}
