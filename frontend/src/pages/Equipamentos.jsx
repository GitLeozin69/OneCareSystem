import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button.jsx'
import EquipamentoForm from '../components/EquipamentoForm.jsx'
import EquipamentosTable from '../components/EquipamentosTable.jsx'
import { equipamentosApi } from '../services/api.js'

const sortOptions = [
  ['createdAt', 'Data de cadastro'], ['updatedAt', 'Última atualização'],
  ['serialNumber', 'Serial'], ['partNumber', 'Part number'], ['cliente', 'Cliente'],
  ['patrimonio', 'Patrimônio'], ['contratoOnecare', 'Contrato OneCare'],
  ['dataInicioOnecare', 'Início do OneCare'], ['dataFimOnecare', 'Término do OneCare'],
]

export default function Equipamentos() {
  const [query, setQuery] = useState({ q: '', page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' })
  const [search, setSearch] = useState('')
  const [view, setView] = useState(null)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [response, setResponse] = useState(null)
  const title = useRef(null)
  const requestKey = JSON.stringify([query, revision])
  const current = response?.key === requestKey ? response : null
  const loading = !current

  useEffect(() => {
    if (view) return
    const controller = new AbortController()
    let active = true
    equipamentosApi.list(query, controller.signal).then((result) => {
      if (active) {
        if (result.pagination.totalPages > 0 && query.page > result.pagination.totalPages) {
          setQuery((previous) => ({ ...previous, page: result.pagination.totalPages }))
        } else setResponse({ key: requestKey, result })
      }
    }).catch((error) => {
      if (active && error.name !== 'AbortError') setResponse({ key: requestKey, error: error.message })
    })
    return () => { active = false; controller.abort() }
  }, [query, requestKey, view])

  useEffect(() => { if (!view) title.current?.focus() }, [view])

  function changeQuery(changes) {
    setQuery((previous) => ({ ...previous, ...changes, page: 1 }))
    setNotice('')
  }

  function returnToList(message = '') {
    setNotice(message)
    setRevision((value) => value + 1)
    setView(null)
  }

  if (view) return <EquipamentoForm key={view.id ?? 'new'} id={view.id} onCancel={() => returnToList()} onSaved={returnToList} />

  const result = current?.result
  const pagination = result?.pagination
  return (
    <section aria-labelledby="page-title">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2">GESTÃO ONECARE</p>
          <h1 id="page-title" ref={title} tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">Equipamentos</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Consulte os equipamentos e mantenha os dados de cobertura organizados.</p>
        </div>
        <Button variant="primary" onClick={() => { setNotice(''); setView({}) }}><span aria-hidden="true" className="mr-2 text-lg">+</span>Novo equipamento</Button>
      </div>
      {notice && <p role="status" className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-900">{notice}</p>}
      <div className="panel overflow-hidden">
        <div className="space-y-5 p-5 sm:p-6">
          <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); changeQuery({ q: search.trim() }) }}>
            <div className="min-w-48 flex-1">
              <label htmlFor="search" className="field-label">Pesquisar equipamentos</label>
              <input id="search" type="search" className="input" placeholder="Serial, part number, cliente, patrimônio ou contrato" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button type="submit" variant="primary">Pesquisar</Button>
            <Button onClick={() => { setSearch(''); changeQuery({ q: '' }) }} disabled={!search && !query.q}>Limpar</Button>
          </form>
          <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-5">
            <div className="min-w-44 flex-1 sm:flex-none">
              <label htmlFor="sortBy" className="field-label">Ordenar por</label>
              <select id="sortBy" className="input" value={query.sortBy} onChange={(event) => changeQuery({ sortBy: event.target.value })}>
                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="order" className="field-label">Direção</label>
              <select id="order" className="input" value={query.order} onChange={(event) => changeQuery({ order: event.target.value })}>
                <option value="asc">Crescente</option><option value="desc">Decrescente</option>
              </select>
            </div>
            <div>
              <label htmlFor="limit" className="field-label">Por página</label>
              <select id="limit" className="input" value={query.limit} onChange={(event) => changeQuery({ limit: Number(event.target.value) })}>
                {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <p className="pb-2 text-xs text-slate-500 sm:ml-auto">Todos os não arquivados, incluindo contratos vencidos.</p>
          </div>
        </div>
        <div aria-busy={loading}>
          {loading ? <p role="status" className="border-t border-slate-100 px-6 py-16 text-center text-slate-600">Carregando equipamentos…</p>
            : current.error ? <div className="space-y-4 border-t border-slate-100 p-8 text-center"><p role="alert" className="text-red-800">{current.error}</p><Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>
              : result.data.length ? <EquipamentosTable items={result.data} onEdit={(id) => { setNotice(''); setView({ id }) }} />
                : <div className="border-t border-slate-100 px-6 py-16 text-center" role="status"><p className="font-semibold">{query.q ? 'Nenhum resultado encontrado' : 'Nenhum equipamento nesta página'}</p><p className="mt-2 text-sm text-slate-500">{query.q ? 'Tente outro termo ou limpe a pesquisa.' : pagination.total === 0 ? 'Use “Novo equipamento” para fazer o primeiro cadastro.' : 'Volte para uma página anterior.'}</p></div>}
        </div>
        <nav aria-label="Paginação de equipamentos" className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <p className="text-sm text-slate-600">{pagination ? `${pagination.total} equipamento(s) · Página ${pagination.page} de ${pagination.totalPages}` : 'Aguardando resultados'}</p>
          <div className="flex gap-2">
            <Button disabled={loading || !pagination || pagination.page <= 1} onClick={() => setQuery((previous) => ({ ...previous, page: previous.page - 1 }))}>← Anterior</Button>
            <Button disabled={loading || !pagination || pagination.page >= pagination.totalPages} onClick={() => setQuery((previous) => ({ ...previous, page: previous.page + 1 }))}>Próxima →</Button>
          </div>
        </nav>
      </div>
    </section>
  )
}
