export function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function nextMondayDateString(from = new Date()) {
  const date = new Date(from)
  const day = date.getDay()
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7
  date.setDate(date.getDate() + daysUntilMonday)
  return formatLocalDate(date)
}
