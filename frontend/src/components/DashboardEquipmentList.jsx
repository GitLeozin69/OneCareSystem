import { formatDate } from '../utils/equipamento.js'
import Button from './Button.jsx'
import OnecareStatus from './OnecareStatus.jsx'

export default function DashboardEquipmentList({ id, title, items, emptyMessage, onView }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby={id}>
      <h2 id={id} className="border-b border-slate-200 px-5 py-5 text-lg font-semibold sm:px-6">{title}</h2>
      {items.length === 0
        ? <p role="status" className="px-5 py-12 text-center text-sm text-slate-600">{emptyMessage}</p>
        : <div className="overflow-x-auto" role="region" aria-label={`${title}, role horizontalmente se necessário`} tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>{['Serial', 'Part number', 'Cliente', 'Contrato', 'Término', 'Status e prazo', 'Ação'].map((label) =>
                <th key={label} scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => <tr key={item.id}>
                <th scope="row" className="px-5 py-4 font-mono text-xs">{item.serialNumber}</th>
                <td className="px-5 py-4">{item.partNumber}</td>
                <td className="min-w-40 px-5 py-4">{item.cliente}</td>
                <td className="px-5 py-4">{item.contratoOnecare || '—'}</td>
                <td className="whitespace-nowrap px-5 py-4 tabular-nums">{formatDate(item.dataFimOnecare)}</td>
                <td className="px-5 py-4"><OnecareStatus status={item.statusOnecare} diasRestantes={item.diasRestantes} /></td>
                <td className="px-5 py-4"><Button onClick={() => onView(item)} aria-label={`Ver detalhes de ${item.serialNumber}`}>Detalhes</Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>
  )
}
