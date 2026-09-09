import { formatDate } from '../utils/equipamento.js'
import Button from './Button.jsx'

export default function EquipamentosTable({ items, onEdit }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Tabela de equipamentos, role horizontalmente se necessário" tabIndex={0}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Equipamentos não arquivados, incluindo contratos vencidos</caption>
        <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
          <tr>{['Serial', 'Part number', 'Cliente', 'Patrimônio', 'Contrato OneCare', 'Início do OneCare', 'Término do OneCare', 'Ações'].map((label) => (
            <th key={label} scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">{label}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-teal-50/40">
              <th scope="row" className="px-5 py-5 font-mono text-xs font-semibold text-slate-900">{item.serialNumber}</th>
              <td className="max-w-48 break-words px-5 py-5">{item.partNumber}</td>
              <td className="min-w-44 max-w-64 break-words px-5 py-5">{item.cliente}</td>
              <td className="max-w-48 break-words px-5 py-5 text-slate-600">{item.patrimonio || '—'}</td>
              <td className="max-w-48 break-words px-5 py-5 text-slate-600">{item.contratoOnecare || '—'}</td>
              <td className="whitespace-nowrap px-5 py-5 tabular-nums">{formatDate(item.dataInicioOnecare)}</td>
              <td className="whitespace-nowrap px-5 py-5 tabular-nums">{formatDate(item.dataFimOnecare)}</td>
              <td className="px-5 py-5"><Button onClick={() => onEdit(item.id)} aria-label={`Editar ${item.serialNumber}`}>Editar</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
