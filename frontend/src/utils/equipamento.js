export const fields = [
  { name: 'serialNumber', label: 'Número de série', required: true, maxLength: 100 },
  { name: 'partNumber', label: 'Part number', required: true, maxLength: 100 },
  { name: 'cliente', label: 'Cliente', required: true, maxLength: 255 },
  { name: 'distribuidor', label: 'Distribuidor', required: true, maxLength: 255 },
  { name: 'patrimonio', label: 'Patrimônio', maxLength: 100 },
  { name: 'notaFiscal', label: 'Nota fiscal', maxLength: 100 },
  { name: 'contratoOnecare', label: 'Contrato OneCare', maxLength: 100 },
  { name: 'dataInicioOnecare', label: 'Início do OneCare', required: true, type: 'date' },
  { name: 'dataFimOnecare', label: 'Término do OneCare', required: true, type: 'date' },
  { name: 'dataUltimaConferencia', label: 'Última conferência', type: 'date' },
]

export function toFormValues(item = {}) {
  return Object.fromEntries(fields.map(({ name }) => [name, item[name] ?? '']))
}

export function formatDate(value) {
  if (!value) return '—'
  return value.split('-').reverse().join('/')
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map(({ type, value: part }) => [type, part]),
  )
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`
}

export function formatRemainingDays(value) {
  if (!Number.isInteger(value)) return 'Prazo não informado'
  if (value > 1) return `Vence em ${value} dias`
  if (value === 1) return 'Vence em 1 dia'
  if (value === 0) return 'Vence hoje'
  if (value === -1) return 'Vencido há 1 dia'
  return `Vencido há ${Math.abs(value)} dias`
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function prepareEquipment(values) {
  const errors = {}
  const payload = {}
  for (const field of fields) {
    const value = values[field.name].trim()
    payload[field.name] = value || (field.required ? '' : null)
    if (field.required && !value) errors[field.name] = 'Este campo é obrigatório.'
    else if (field.maxLength && value.length > field.maxLength) {
      errors[field.name] = `Use no máximo ${field.maxLength} caracteres.`
    } else if (field.type === 'date' && value && !validDate(value)) {
      errors[field.name] = 'Informe uma data válida.'
    }
  }
  payload.serialNumber = payload.serialNumber.toUpperCase()
  if (payload.serialNumber && !/^[A-Z0-9]+$/.test(payload.serialNumber)) {
    errors.serialNumber = 'Use somente letras de A a Z e números, sem espaços ou caracteres especiais.'
  }
  if (!errors.dataInicioOnecare && !errors.dataFimOnecare && payload.dataFimOnecare < payload.dataInicioOnecare) {
    errors.dataFimOnecare = 'O término não pode ser anterior ao início do OneCare.'
  }
  return { payload, errors }
}
