export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

export function formatDiaryDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day || !MONTHS_ES[month - 1]) {
    return value
  }

  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}

export function formatAdminDateTime(value: string | null) {
  if (!value) {
    return "sin fecha"
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const isoMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)

  if (isoMatch) {
    return `${isoMatch[1]} ${isoMatch[2]}`
  }

  return value
}

export function formatIdTimestamp(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hours = String(value.getHours()).padStart(2, "0")
  const minutes = String(value.getMinutes()).padStart(2, "0")
  const seconds = String(value.getSeconds()).padStart(2, "0")
  const milliseconds = String(value.getMilliseconds()).padStart(3, "0")

  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`
}

export function formatDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.toISOString().slice(0, 10) === value
}
