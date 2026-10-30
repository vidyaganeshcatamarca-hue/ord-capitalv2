/**
 * Lectura de montos tipeados por el usuario.
 *
 * El bug que motivó esto (ronda de auditoría, F-01): el código hacía
 * `parseFloat(valor.replace(/\./g, '').replace(',', '.'))` sobre el value de un
 * `input[type="number"]`. Ese value SIEMPRE usa el punto como separador decimal y
 * NUNCA lleva separador de miles, así que borrar los puntos convertía 1500.50 en
 * 150050: cualquiera que escribiera centavos multiplicaba su asignación por 100.
 *
 * Regla: con coma y punto juntos, el último es el decimal. Con un solo tipo de
 * separador, un único punto es decimal (lo que produce un input numérico) y varios
 * puntos son separadores de miles (texto pegado).
 */

const LIMPIEZA = /[\s\u00A0\u202F']/g
const SIMBOLOS = /[$€£¥]|ARS|USD|EUR|GBP|BRL/gi

/**
 * Convierte lo tipeado a número.
 * Devuelve NaN cuando no hay ningún dígito, para que el llamador decida qué decir.
 */
export function parseMontoInput(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  if (raw == null) return NaN

  const limpio = String(raw).replace(LIMPIEZA, '').replace(SIMBOLOS, '')
  if (!/\d/.test(limpio)) return NaN

  const negativo = limpio.startsWith('-')
  const cuerpo = negativo ? limpio.slice(1) : limpio

  let normalizado: string
  if (cuerpo.includes(',') && cuerpo.includes('.')) {
    // Los dos presentes: el último en aparecer es el decimal. "1.500,50" / "1,500.50"
    const decimal = cuerpo.lastIndexOf(',') > cuerpo.lastIndexOf('.') ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    normalizado = cuerpo.split(miles).join('').replace(decimal, '.')
  } else if (cuerpo.includes(',')) {
    const partes = cuerpo.split(',')
    const ultima = partes[partes.length - 1]
    // Tres dígitos detrás de la única coma son miles ("1,500"); si no, es decimal.
    normalizado = partes.length === 2 && ultima.length !== 3
      ? `${partes[0]}.${ultima}`
      : partes.join('')
  } else if (cuerpo.includes('.')) {
    const partes = cuerpo.split('.')
    normalizado = partes.length === 2
      ? `${partes[0]}.${partes[1]}`
      : partes.join('')
  } else {
    normalizado = cuerpo
  }

  const n = Number.parseFloat(normalizado)
  if (!Number.isFinite(n)) return NaN
  return negativo ? -n : n
}

/** Igual que parseMontoInput, pero devuelve 0 en vez de NaN. */
export function parseMontoInputOrZero(raw: string | number | null | undefined): number {
  const n = parseMontoInput(raw)
  return Number.isFinite(n) ? n : 0
}
