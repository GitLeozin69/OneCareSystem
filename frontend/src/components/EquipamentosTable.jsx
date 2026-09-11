import { formatDate, formatDateTime } from '../utils/equipamento.js'
import Button from './Button.jsx'
import OnecareStatus from './OnecareStatus.jsx'

export default function EquipamentosTable({
  items,
  archived,
  busyId,
  onArchive,
  onEdit,
  onHistory,
  onRestore,
  onView,
}) {
  const headings = [
    'Serial', 'Part number', 'Cliente', 'Distribuidor', 'Patrimônio',
    'Nota fiscal', 'Contrato OneCare',
    'Início do OneCare', 'Término do OneCare',
    ...(!archived ? ['Status e prazo'] : []),
    ...(archived ? ['Data do arquivamento'] : []),
    'Ações',
  ]

  return (
    <div className="overflow-x-auto" role="region" aria-label="Tabela de equipamentos, role horizontalmente se necessário" tabIndex={0}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{archived ? 'Equipamentos arquivados' : 'Equipamentos não arquivados, incluindo contratos vencidos'}</caption>
        <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
          <tr>{headings.map((label) => (
            <th key={label} scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">{label}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-teal-50/40">
              <th scope="row" className="px-5 py-5 font-mono text-xs font-semibold text-slate-900">{item.serialNumber}</th>
              <td className="max-w-48 break-words px-5 py-5">{item.partNumber}</td>
              <td className="min-w-44 max-w-64 break-words px-5 py-5">{item.cliente}</td>
              <td className="min-w-44 max-w-64 break-words px-5 py-5">{item.distribuidor}</td>
              <td className="max-w-48 break-words px-5 py-5 text-slate-600">{item.patrimonio || '—'}</td>
              <td className="max-w-48 break-words px-5 py-5 text-slate-600">{item.notaFiscal || '—'}</td>
              <td className="max-w-48 break-words px-5 py-5 text-slate-600">{item.contratoOnecare || '—'}</td>
              <td className="whitespace-nowrap px-5 py-5 tabular-nums">{formatDate(item.dataInicioOnecare)}</td>
              <td className="whitespace-nowrap px-5 py-5 tabular-nums">{formatDate(item.dataFimOnecare)}</td>
              {!archived && <td className="px-5 py-5"><OnecareStatus status={item.statusOnecare} diasRestantes={item.diasRestantes} /></td>}
              {archived && <td className="whitespace-nowrap px-5 py-5 tabular-nums">{formatDateTime(item.arquivadoEm)}</td>}
              <td className="px-5 py-5">
                <div className="flex gap-2">
                  <Button disabled={Boolean(busyId)} onClick={() => onView(item)} aria-label={`Ver detalhes de ${item.serialNumber}`}>Detalhes</Button>
                  {!archived && <Button disabled={Boolean(busyId)} onClick={() => onEdit(item)} aria-label={`Editar ${item.serialNumber}`}>Editar</Button>}
                  <Button disabled={Boolean(busyId)} onClick={() => onHistory(item)} aria-label={`Ver histórico de ${item.serialNumber}`}>Ver histórico</Button>
                  {archived
                    ? <Button disabled={Boolean(busyId)} onClick={() => onRestore(item)} aria-label={`Restaurar ${item.serialNumber}`}>{busyId === item.id ? 'Restaurando…' : 'Restaurar'}</Button>
                    : <Button disabled={Boolean(busyId)} onClick={() => onArchive(item)} aria-label={`Arquivar ${item.serialNumber}`}>{busyId === item.id ? 'Arquivando…' : 'Arquivar'}</Button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
