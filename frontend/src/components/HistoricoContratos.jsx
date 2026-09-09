import { useEffect, useRef, useState } from 'react'
import { equipamentosApi } from '../services/api.js'
import { formatDate, formatDateTime } from '../utils/equipamento.js'
import Button from './Button.jsx'

function ContractValues({ title, values }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Contrato</dt><dd className="mt-1 break-words font-medium">{values.contratoOnecare || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Início</dt><dd className="mt-1 font-medium tabular-nums">{formatDate(values.dataInicioOnecare)}</dd></div>
        <div><dt className="text-xs text-slate-500">Término</dt><dd className="mt-1 font-medium tabular-nums">{formatDate(values.dataFimOnecare)}</dd></div>
      </dl>
    </section>
  )
}

export default function HistoricoContratos({ equipamento, onBack }) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [response, setResponse] = useState(null)
  const title = useRef(null)
  const key = `${page}:${revision}`
  const current = response?.key === key ? response : null

  useEffect(() => { title.current?.focus() }, [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    equipamentosApi.history(equipamento.id, { page, limit: 20 }, controller.signal)
      .then((result) => { if (active) setResponse({ key, result }) })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setResponse({ key, error: error.message })
      })
    return () => { active = false; controller.abort() }
  }, [equipamento.id, key, page])

  const result = current?.result
  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="history-title">
      <Button onClick={onBack} className="mb-6">← Voltar</Button>
      <div className="panel overflow-hidden">
        <header className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <p className="eyebrow mb-2">HISTÓRICO DO CONTRATO</p>
          <h1 id="history-title" ref={title} tabIndex={-1} className="text-2xl font-semibold tracking-tight">{equipamento.serialNumber}</h1>
          <p className="mt-2 text-sm text-slate-600">Alterações do contrato OneCare, da mais recente para a mais antiga.</p>
        </header>
        {!current ? <p role="status" className="p-8 text-center">Carregando histórico…</p>
          : current.error ? <div className="space-y-4 p-8 text-center"><p role="alert" className="text-red-800">{current.error}</p><Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>
            : result.data.length === 0 ? <p role="status" className="p-10 text-center font-medium">Nenhuma alteração de contrato registrada</p>
              : <div className="space-y-5 p-5 sm:p-8">{result.data.map((event) => (
                <article key={event.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <h2 className="mb-4 text-sm font-semibold">Alteração registrada em {formatDateTime(event.substituidoEm)}</h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ContractValues title="Valor anterior" values={event.anterior} />
                    <ContractValues title="Valor novo" values={event.novo} />
                  </div>
                </article>
              ))}</div>}
        <nav aria-label="Paginação do histórico" className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-8">
          <p className="text-sm text-slate-600">{result ? `${result.pagination.total} alteração(ões) · Página ${result.pagination.page} de ${result.pagination.totalPages}` : 'Aguardando resultados'}</p>
          <div className="flex gap-2">
            <Button disabled={!result || page <= 1} onClick={() => setPage((value) => value - 1)}>← Anterior</Button>
            <Button disabled={!result || page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima →</Button>
          </div>
        </nav>
      </div>
    </section>
  )
}
