export const ONECARE_TIME_ZONE = 'America/Fortaleza'
export const ONECARE_STATUSES = ['ATIVO', 'VENCENDO', 'VENCIDO']

const DAY_MS = 24 * 60 * 60 * 1000
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ONECARE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ONECARE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
})

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day))
}

function dateParts(value) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  }
}

function currentDateInFortaleza(now) {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(now)
      .filter(({ type }) => ['year', 'month', 'day'].includes(type))
      .map(({ type, value }) => [type, Number(value)]),
  )
  return utcDate(parts.year, parts.month, parts.day)
}

export function addCalendarMonths(value, amount) {
  const { year, month, day } = dateParts(value)
  const targetMonthIndex = month - 1 + amount
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate()

  return utcDate(targetYear, normalizedMonthIndex + 1, Math.min(day, lastDay))
}

export function createOnecareReference(now = new Date()) {
  const today = currentDateInFortaleza(now)
  return { today, threeMonthLimit: addCalendarMonths(today, 3) }
}

export function formatOnecareGeneratedAt(now) {
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(now).map(({ type, value }) => [type, value]),
  )
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00'
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`
}

export function calculateOnecareStatus(dataFimOnecare, reference = createOnecareReference()) {
  if (!dataFimOnecare) return { statusOnecare: null, diasRestantes: null }

  const endDate = utcDate(
    dataFimOnecare.getUTCFullYear(),
    dataFimOnecare.getUTCMonth() + 1,
    dataFimOnecare.getUTCDate(),
  )
  const diasRestantes = (endDate.getTime() - reference.today.getTime()) / DAY_MS
  const statusOnecare = endDate < reference.today
    ? 'VENCIDO'
    : endDate <= reference.threeMonthLimit ? 'VENCENDO' : 'ATIVO'

  return { statusOnecare, diasRestantes }
}

export function withOnecareStatus(equipamento, reference) {
  return {
    ...equipamento,
    ...calculateOnecareStatus(equipamento.dataFimOnecare, reference),
  }
}

export function onecareStatusWhere(status, reference) {
  if (status === 'VENCIDO') return { lt: reference.today }
  if (status === 'VENCENDO') {
    return { gte: reference.today, lte: reference.threeMonthLimit }
  }
  return { gt: reference.threeMonthLimit }
}
