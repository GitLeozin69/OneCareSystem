export default function DashboardCard({ title, value, tone, onClick }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    red: 'border-red-200 bg-red-50 text-red-950',
    gray: 'border-slate-200 bg-slate-100 text-slate-900',
    dark: 'border-slate-300 bg-slate-200 text-slate-950',
  }
  const content = <><span className="text-sm font-semibold">{title}</span><strong className="text-3xl tabular-nums">{value}</strong></>
  const className = `flex min-h-32 flex-col items-start justify-between rounded-2xl border p-5 text-left shadow-sm ${tones[tone]}`

  return onClick
    ? <button type="button" className={`${className} transition-transform hover:-translate-y-0.5`} onClick={onClick} aria-label={`${title}: ${value}. Abrir listagem.`}>{content}</button>
    : <div className={className} aria-label={`${title}: ${value}.`}>{content}</div>
}
