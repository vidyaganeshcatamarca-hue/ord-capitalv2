/**
 * parseCalendarDate — fecha calendario ORD sin zona horaria.
 * ============================================
 * Un campo `YYYY-MM-DD` de ORD es una fecha del calendario, no un instante.
 * `new Date('2026-10-15')` lo parsea como UTC medianoche y, con el device en
 * UTC-3, el formateo local muestra el 14: el bug de la cuarentena de voz.
 * Acá se arma desde componentes locales (igual que `toLocalDateString`
 * hace simétrico al serializar).
 */
export function parseCalendarDate(dateStr: string | undefined | null): Date {
  if (!dateStr) return new Date(NaN)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) return new Date(NaN)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Rango exacto: `Date` rueda meses/días inválidos (2026-13-40 -> fecha real).
  const daysInMonth = new Date(year, month, 0).getDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return new Date(NaN)
  // 12:00 local evita el borde del día para formateo defensivo, pero la
  // fecha construida es a medianoche local: el día calendario es exacto.
  return new Date(year, month - 1, day)
}