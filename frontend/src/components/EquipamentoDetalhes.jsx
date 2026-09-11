import { useEffect, useRef } from 'react'
import { formatDate } from '../utils/equipamento.js'
import Button from './Button.jsx'
import OnecareStatus from './OnecareStatus.jsx'

const text = (value) => value || 'Não informado'

export default function EquipamentoDetalhes({ equipamento, onBack, onEdit, onHistory }) {
  const title = useRef(null)
  useEffect(() => { title.current?.focus() }, [])
  const details = [
    ['Número de série', equipamento.serialNumber],
    ['Part number', equipamento.partNumber],
    ['Cliente', equipamento.cliente],
    ['Distribuidor', equipamento.distribuidor],
    ['Patrimônio', text(equipamento.patrimonio)],
    ['Nota fiscal', text(equipamento.notaFiscal)],
    ['Contrato OneCare', text(equipamento.contratoOnecare)],
    ['Início do OneCare', equipamento.dataInicioOnecare
      ? formatDate(equipamento.dataInicioOnecare) : 'Não informado'],
    ['Término do OneCare', formatDate(equipamento.dataFimOnecare)],
    ['Última conferência', formatDate(equipamento.dataUltimaConferencia)],
  ]

  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="details-title">
      <Button onClick={onBack} className="mb-6">← Voltar</Button>
      <div className="panel overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 px-6 py-6 sm:px-8">
          <div>
            <p className="eyebrow mb-2">DETALHES DO EQUIPAMENTO</p>
            <h1 id="details-title" ref={title} tabIndex={-1} className="text-2xl font-semibold tracking-tight">{equipamento.serialNumber}</h1>
          </div>
          <OnecareStatus status={equipamento.statusOnecare} diasRestantes={equipamento.diasRestantes} />
        </header>
        <dl className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
          {onHistory && <Button onClick={onHistory}>Ver histórico</Button>}
          {onEdit && !equipamento.arquivado && <Button variant="primary" onClick={onEdit}>Editar equipamento</Button>}
        </div>
      </div>
    </section>
  )
}
