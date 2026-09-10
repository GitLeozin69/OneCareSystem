import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import { equipamentosApi } from '../services/api.js'
import { formatDate } from '../utils/equipamento.js'

const columns = [
  ['serialNumber', 'Serial'], ['partNumber', 'Product Family / Part number'],
  ['cliente', 'Cliente'], ['distribuidor', 'Distribuidor'], ['contratoOnecare', 'Contrato'],
  ['dataInicioOnecare', 'Início'], ['dataFimOnecare', 'Término'],
]

function ErrorList({ errors }) {
  return <ul className="space-y-1">{errors.map((error, index) => (
    <li key={index}>
      {error.rowNumber ? `Linha ${error.rowNumber} · ` : ''}{error.field}: {error.message}
      {error.value !== null && error.value !== undefined ? ` (${String(error.value)})` : ''}
      {error.conflictingRows?.length ? ` Linhas conflitantes: ${error.conflictingRows.join(', ')}.` : ''}
      {error.conflictingRowsTruncated ? ` Exibindo até 50 de ${error.conflictingRowCount} conflitos; filtre as linhas inválidas para ver todos os registros.` : ''}
    </li>
  ))}</ul>
}

export default function ImportacaoExcel({ onCancel, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const lock = useRef(false)
  const request = useRef(null)
  const input = useRef(null)
  const title = useRef(null)
  useEffect(() => {
    title.current?.focus()
    return () => request.current?.abort()
  }, [])

  function changeFile(selected) {
    if (lock.current) return
    setPreview(null)
    setError(null)
    setFilter('ALL')
    setPage(1)
    setFile(selected)
    if (selected && (!/\.xlsx$/i.test(selected.name) || selected.size === 0 || selected.size > 10 * 1024 * 1024)) {
      setError({ message: 'Selecione um arquivo .xlsx não vazio de até 10 MB.' })
      setFile(null)
    }
  }

  async function execute(confirm) {
    if (lock.current || !file || confirm && !preview?.summary.canImport) return
    lock.current = true
    setBusy(true)
    setError(null)
    request.current = new AbortController()
    try {
      if (confirm) {
        const result = await equipamentosApi.confirmImport(file, request.current.signal)
        setFile(null)
        setPreview(null)
        if (input.current) input.current.value = ''
        onImported(`${result.summary.importedRows} equipamento(s) importado(s) com sucesso.`)
      } else {
        setPreview(null)
        const result = await equipamentosApi.validateImport(file, request.current.signal)
        setPreview(result)
        setPage(1)
        setFilter('ALL')
      }
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        setError(failure)
        setPreview(null)
      }
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const filtered = preview?.rows.filter((row) => filter === 'ALL' || row.status === filter) ?? []
  const pages = Math.max(1, Math.ceil(filtered.length / 50))
  return <section aria-labelledby="import-title" aria-busy={busy}>
    <h1 id="import-title" ref={title} tabIndex={-1} className="mb-4 text-3xl font-semibold">Importar Excel</h1>
    <div className="panel space-y-5 p-5 sm:p-6">
      <p>Selecione um arquivo .xlsx de até 10 MB e 10.000 linhas. Somente a primeira aba é lida, com cabeçalho na primeira linha. A importação só é permitida quando todas as linhas são válidas.</p>
      <details>
        <summary className="cursor-pointer font-semibold">Colunas reconhecidas e regras</summary>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm">
          <li>Contract Name → contrato (opcional).</li>
          <li>Distributor Name → distribuidor; End User Name → cliente.</li>
          <li>Contract Start Date → início; Contract End Date → término.</li>
          <li>Product Family → part number; Serial # → serial.</li>
          <li>As demais colunas acima são obrigatórias. Espaços repetidos e diferenças entre maiúsculas e minúsculas no cabeçalho são aceitos.</li>
          <li>Contract Status, Reseller Name e Quantity são ignorados. Cada linha cria um equipamento.</li>
          <li>Datas: célula de data Excel, DD/MM/AAAA ou AAAA-MM-DD. Fórmulas não são aceitas nos campos importados.</li>
          <li>Patrimônio, nota fiscal e última conferência serão null. Não se extraem dados do nome do arquivo.</li>
          <li>Seriais duplicados, inclusive de arquivados, bloqueiam todo o arquivo. Não há atualização ou restauração automática.</li>
        </ul>
      </details>
      <div>
        <label className="field-label" htmlFor="excel-file">Planilha Excel</label>
        <input ref={input} id="excel-file" type="file" accept=".xlsx" disabled={busy}
          className="input" onChange={(event) => changeFile(event.target.files?.[0] ?? null)} />
        {file && <p className="mt-2 break-all text-sm">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy || !file} onClick={() => execute(false)}>Validar planilha</Button>
        <Button disabled={busy || !file} onClick={() => { changeFile(null); input.current.value = ''; input.current.focus() }}>Trocar arquivo</Button>
        <Button disabled={busy} onClick={onCancel}>Cancelar importação</Button>
      </div>
      {busy && <p role="status">Processando planilha… Aguarde a conclusão.</p>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
        <p>{error.message}</p>
        {error.details?.length > 0 && <ErrorList errors={error.details} />}
        <p className="mt-2">Valide novamente antes de confirmar. Se a conexão caiu na confirmação, confira a listagem antes de tentar novamente.</p>
      </div>}
      {preview && <>
        <p role="status">{preview.summary.totalRows} linha(s) · {preview.summary.validRows} válida(s) · {preview.summary.invalidRows} inválida(s)</p>
        {preview.warnings.length > 0 && <div className="rounded-xl bg-amber-50 p-4"><h2 className="font-semibold">Avisos</h2>
          <ul>{preview.warnings.map((warning, i) => <li key={i}>{warning.message}</li>)}</ul></div>}
        <div><label className="field-label" htmlFor="import-filter">Filtrar prévia</label>
          <select id="import-filter" className="input max-w-xs" value={filter} disabled={busy}
            onChange={(event) => { setFilter(event.target.value); setPage(1) }}>
            <option value="ALL">Todas</option><option value="VALID">Válidas</option><option value="INVALID">Inválidas</option>
          </select></div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Prévia da importação">
          <table className="w-full text-left text-sm"><thead><tr>
            <th className="p-3">Linha</th><th className="p-3">Resultado</th>
            {columns.map(([field, label]) => <th className="p-3" key={field}>{label}</th>)}<th className="p-3">Erros</th>
          </tr></thead><tbody>{filtered.slice((page - 1) * 50, page * 50).map((row) => <tr key={row.rowNumber} className="border-t border-slate-200">
            <th className="p-3" scope="row">{row.rowNumber}</th><td className="p-3">{row.status === 'VALID' ? 'Válida' : 'Inválida'}</td>
            {columns.map(([field]) => <td className="min-w-32 max-w-64 break-words p-3" key={field}>
              {field.startsWith('data') && /^\d{4}-\d{2}-\d{2}$/.test(row.data[field] ?? '') ? formatDate(row.data[field]) : String(row.data[field] ?? '—')}
            </td>)}<td className="min-w-64 p-3 text-red-800"><ErrorList errors={row.errors} /></td>
          </tr>)}</tbody></table>
          {!filtered.length && <p className="p-4">Nenhuma linha neste filtro.</p>}
        </div>
        <nav aria-label="Paginação da prévia" className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Anterior na prévia</Button>
          <p>Página {page} de {pages} · até 50 linhas por página</p>
          <Button disabled={busy || page >= pages} onClick={() => setPage(page + 1)}>Próxima na prévia</Button>
        </nav>
      </>}
      <Button variant="primary" disabled={busy || !file || !preview?.summary.canImport || preview.summary.invalidRows > 0}
        onClick={() => execute(true)}>Confirmar importação</Button>
    </div>
  </section>
}
