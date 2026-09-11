import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button.jsx'
import EquipamentoDetalhes from '../components/EquipamentoDetalhes.jsx'
import EquipamentoForm from '../components/EquipamentoForm.jsx'
import EquipamentosTable from '../components/EquipamentosTable.jsx'
import HistoricoContratos from '../components/HistoricoContratos.jsx'
import ImportacaoExcel from '../components/ImportacaoExcel.jsx'
import { equipamentosApi } from '../services/api.js'

const defaultQuery = {
  q: '', page: 1, limit: 20, sortBy: 'createdAt', order: 'desc',
}
const statusOptions = [
  ['', 'Todos'], ['ATIVO', 'Ativos'], ['VENCENDO', 'Vencendo'], ['VENCIDO', 'Vencidos'],
]
const sortOptions = [
  ['createdAt', 'Data de cadastro'], ['updatedAt', 'Última atualização'],
  ['serialNumber', 'Serial'], ['partNumber', 'Part number'], ['cliente', 'Cliente'],
  ['distribuidor', 'Distribuidor'], ['patrimonio', 'Patrimônio'],
  ['notaFiscal', 'Nota fiscal'], ['contratoOnecare', 'Contrato OneCare'],
  ['dataInicioOnecare', 'Início do OneCare'], ['dataFimOnecare', 'Término do OneCare'],
]

export default function Equipamentos() {
  const [mode, setMode] = useState('active')
  const [queries, setQueries] = useState({
    active: { ...defaultQuery, status: '' },
    expired: { ...defaultQuery, status: 'VENCIDO' },
    archived: { ...defaultQuery },
  })
  const [searches, setSearches] = useState({ active: '', expired: '', archived: '' })
  const [view, setView] = useState(null)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [operationError, setOperationError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [response, setResponse] = useState(null)
  const operationLock = useRef(false)
  const title = useRef(null)
  const query = queries[mode]
  const search = searches[mode]
  const requestKey = JSON.stringify([mode, query, revision])
  const current = response?.key === requestKey ? response : null
  const loading = !current

  useEffect(() => {
    if (view) return
    const controller = new AbortController()
    let active = true
    const list = mode === 'archived'
      ? equipamentosApi.listArchived
      : equipamentosApi.list

    list(query, controller.signal).then((result) => {
      if (!active) return
      if (result.pagination.totalPages > 0 && query.page > result.pagination.totalPages) {
        setQueries((previous) => ({
          ...previous,
          [mode]: { ...previous[mode], page: result.pagination.totalPages },
        }))
      } else setResponse({ key: requestKey, result })
    }).catch((error) => {
      if (active && error.name !== 'AbortError') {
        setResponse({ key: requestKey, error: error.message })
      }
    })
    return () => { active = false; controller.abort() }
  }, [mode, query, requestKey, view])

  useEffect(() => { if (!view) title.current?.focus() }, [mode, view])

  function changeQuery(changes) {
    setQueries((previous) => ({
      ...previous,
      [mode]: { ...previous[mode], ...changes, page: 1 },
    }))
    setNotice('')
    setOperationError('')
  }

  function returnToList(message = '') {
    setNotice(message)
    setRevision((value) => value + 1)
    setView(null)
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setNotice('')
    setOperationError('')
  }

  async function runArchiveAction(item, action) {
    if (operationLock.current) return
    const restoring = action === 'restore'
    const confirmed = window.confirm(
      `${restoring ? 'Restaurar' : 'Arquivar'} o equipamento ${item.serialNumber}?`,
    )
    if (!confirmed) return

    operationLock.current = true
    setBusyId(item.id)
    setOperationError('')
    try {
      if (restoring) await equipamentosApi.restore(item.id)
      else await equipamentosApi.archive(item.id)
      setNotice(restoring
        ? `Equipamento ${item.serialNumber} restaurado com sucesso.`
        : `Equipamento ${item.serialNumber} arquivado com sucesso.`)
      const isLastItem = current?.result?.data.length === 1 && query.page > 1
      if (isLastItem) {
        setQueries((previous) => ({
          ...previous,
          [mode]: { ...previous[mode], page: previous[mode].page - 1 },
        }))
      } else setRevision((value) => value + 1)
    } catch (error) {
      setOperationError(error.message)
    } finally {
      operationLock.current = false
      setBusyId(null)
    }
  }

  if (view?.type === 'import') return <ImportacaoExcel onCancel={() => returnToList()} onImported={returnToList} />

  if (view?.type === 'history') {
    return (
      <HistoricoContratos
        equipamento={view.item}
        onBack={() => setView(view.returnView ?? null)}
      />
    )
  }

  if (view?.type === 'details') {
    return (
      <EquipamentoDetalhes
        equipamento={view.item}
        onBack={() => setView(null)}
        onEdit={() => setView({ type: 'form', item: view.item })}
        onHistory={() => setView({ type: 'history', item: view.item, returnView: view })}
      />
    )
  }

  if (view?.type === 'form') {
    return (
      <EquipamentoForm
        key={view.item?.id ?? 'new'}
        id={view.item?.id}
        onCancel={() => returnToList()}
        onSaved={returnToList}
        onHistory={view.item ? () => setView({
          type: 'history', item: view.item, returnView: view,
        }) : undefined}
      />
    )
  }

  const archived = mode === 'archived'
  const expired = mode === 'expired'
  const selectedStatusLabel = statusOptions.find(([value]) => value === query.status)?.[1]
  const result = current?.result
  const pagination = result?.pagination
  return (
    <section aria-labelledby="page-title">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2">GESTÃO ONECARE</p>
          <h1 id="page-title" ref={title} tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {archived ? 'Equipamentos arquivados' : expired ? 'Equipamentos vencidos' : 'Equipamentos'}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {archived
              ? 'Consulte equipamentos retirados manualmente da operação e restaure-os quando necessário.'
              : expired
                ? 'Consulte e atualize equipamentos cuja cobertura OneCare já terminou.'
              : 'Consulte os equipamentos e mantenha os dados de cobertura organizados.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!archived && !expired && <Button onClick={() => { setNotice(''); setView({ type: 'import' }) }}>Importar Excel</Button>}
          {!expired && <Button onClick={() => switchMode('expired')}>Equipamentos vencidos</Button>}
          {expired && <Button onClick={() => switchMode('active')}>← Voltar aos equipamentos</Button>}
          <Button onClick={() => switchMode(archived ? 'active' : 'archived')}>
            {archived ? '← Voltar aos equipamentos' : 'Equipamentos arquivados'}
          </Button>
          {!archived && !expired && (
            <Button variant="primary" onClick={() => {
              setNotice('')
              setView({ type: 'form' })
            }}>
              <span aria-hidden="true" className="mr-2 text-lg">+</span>
              Novo equipamento
            </Button>
          )}
        </div>
      </div>
      {notice && <p role="status" className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-900">{notice}</p>}
      {operationError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{operationError}</p>}
      <div className="panel overflow-hidden">
        <div className="space-y-5 p-5 sm:p-6">
          <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
            event.preventDefault()
            changeQuery({ q: search.trim() })
          }}>
            <div className="min-w-48 flex-1">
              <label htmlFor="search" className="field-label">
                {archived ? 'Pesquisar equipamentos arquivados' : expired ? 'Pesquisar equipamentos vencidos' : 'Pesquisar equipamentos'}
              </label>
              <input
                id="search"
                type="search"
                className="input"
                placeholder="Serial, part number, cliente, distribuidor, patrimônio, nota fiscal ou contrato"
                value={search}
                onChange={(event) => setSearches((previous) => ({
                  ...previous, [mode]: event.target.value,
                }))}
              />
            </div>
            <Button type="submit" variant="primary">Pesquisar</Button>
            <Button onClick={() => {
              setSearches((previous) => ({ ...previous, [mode]: '' }))
              changeQuery({ q: '' })
            }} disabled={!search && !query.q}>Limpar</Button>
          </form>
          <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-5">
            {!archived && !expired && <div>
              <label htmlFor="status" className="field-label">Status OneCare</label>
              <select id="status" className="input" value={query.status} onChange={(event) => changeQuery({ status: event.target.value })}>
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>}
            <div className="min-w-44 flex-1 sm:flex-none">
              <label htmlFor="sortBy" className="field-label">Ordenar por</label>
              <select id="sortBy" className="input" value={query.sortBy} onChange={(event) => changeQuery({ sortBy: event.target.value })}>
                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="order" className="field-label">Direção</label>
              <select id="order" className="input" value={query.order} onChange={(event) => changeQuery({ order: event.target.value })}>
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
              </select>
            </div>
            <div>
              <label htmlFor="limit" className="field-label">Por página</label>
              <select id="limit" className="input" value={query.limit} onChange={(event) => changeQuery({ limit: Number(event.target.value) })}>
                {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <p className="pb-2 text-xs text-slate-500 sm:ml-auto">
              {archived
                ? 'Arquivado é uma retirada manual da operação.'
                : expired ? 'Filtro do backend: somente contratos vencidos.'
                  : 'Todos os não arquivados; use o filtro para consultar o status.'}
            </p>
          </div>
        </div>
        <div aria-busy={loading || Boolean(busyId)}>
          {loading ? <p role="status" className="border-t border-slate-100 px-6 py-16 text-center text-slate-600">{expired ? 'Carregando equipamentos vencidos…' : 'Carregando equipamentos…'}</p>
            : current.error ? <div className="space-y-4 border-t border-slate-100 p-8 text-center"><p role="alert" className="text-red-800">{current.error}</p><Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>
              : result.data.length ? (
                <EquipamentosTable
                  items={result.data}
                  archived={archived}
                  busyId={busyId}
                  onEdit={(item) => { setNotice(''); setView({ type: 'form', item }) }}
                  onView={(item) => setView({ type: 'details', item })}
                  onHistory={(item) => setView({ type: 'history', item })}
                  onArchive={(item) => runArchiveAction(item, 'archive')}
                  onRestore={(item) => runArchiveAction(item, 'restore')}
                />
              ) : <div className="border-t border-slate-100 px-6 py-16 text-center" role="status"><p className="font-semibold">{query.q ? 'Nenhum resultado encontrado' : archived ? 'Nenhum equipamento arquivado' : expired ? 'Nenhum equipamento vencido encontrado.' : query.status ? `Nenhum equipamento com status ${selectedStatusLabel}` : 'Nenhum equipamento nesta página'}</p><p className="mt-2 text-sm text-slate-500">{query.q ? 'Tente outro termo ou limpe a pesquisa.' : archived ? 'Os equipamentos arquivados aparecerão aqui.' : expired ? 'Não há contratos vencidos na listagem operacional.' : query.status ? 'Selecione outro status ou escolha “Todos”.' : pagination.total === 0 ? 'Use “Novo equipamento” para fazer o primeiro cadastro.' : 'Volte para uma página anterior.'}</p></div>}
        </div>
        <nav aria-label={archived ? 'Paginação de equipamentos arquivados' : expired ? 'Paginação de equipamentos vencidos' : 'Paginação de equipamentos'} className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <p className="text-sm text-slate-600">{pagination ? `${pagination.total} equipamento(s) · Página ${pagination.page} de ${pagination.totalPages}` : 'Aguardando resultados'}</p>
          <div className="flex gap-2">
            <Button disabled={loading || Boolean(busyId) || !pagination || pagination.page <= 1} onClick={() => setQueries((previous) => ({ ...previous, [mode]: { ...previous[mode], page: previous[mode].page - 1 } }))}>← Anterior</Button>
            <Button disabled={loading || Boolean(busyId) || !pagination || pagination.page >= pagination.totalPages} onClick={() => setQueries((previous) => ({ ...previous, [mode]: { ...previous[mode], page: previous[mode].page + 1 } }))}>Próxima →</Button>
          </div>
        </nav>
      </div>
    </section>
  )
}
