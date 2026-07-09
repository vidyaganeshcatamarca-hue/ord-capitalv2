export function formatCurrency(amount: number | string | undefined | null, currency: string = 'ARS'): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return String(dateStr)
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateShort(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return String(dateStr)
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export function formatNumber(amount: number | string | undefined | null): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)
}
