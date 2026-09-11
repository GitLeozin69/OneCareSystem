import { formatRemainingDays } from '../utils/equipamento.js'

const presentations = {
  ATIVO: { label: 'Ativo', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  VENCENDO: { label: 'Vencendo', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  VENCIDO: { label: 'Vencido', className: 'border-red-200 bg-red-50 text-red-800' },
}

export default function OnecareStatus({ status, diasRestantes }) {
  const presentation = presentations[status] ?? {
    label: 'Sem data de término',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  }
  const deadline = formatRemainingDays(diasRestantes)

  return (
    <div className="min-w-36 space-y-1.5" aria-label={`${presentation.label}. ${deadline}.`}>
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}>
        {presentation.label}
      </span>
      <p className="whitespace-nowrap text-xs text-slate-600">{deadline}</p>
    </div>
  )
}
