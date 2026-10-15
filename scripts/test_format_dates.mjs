// Test: formatDate/formatDateShort en dual-path:
//  * YYYY-MM-DD = fecha calendario (nunca se corre un dia por UTC).
//  * ISO con hora = instante (comportamiento historico: new Date).
// Uso: node scripts/test_format_dates.mjs
import assert from 'node:assert'

process.env.TZ = 'America/Argentina/Buenos_Aires'
const { formatDate, formatDateShort, setFormatContext } = await import('../src/lib/format.ts')

setFormatContext({ locale: 'es-AR', localCurrency: 'ARS', decimalsLocal: 0, decimalsSecondary: 1 })

// Caso del bug: 15 -> "15 ... 2026", nunca 14
const display = formatDate('2026-10-15')
assert.ok(/^15\b/.test(display) && /2026/.test(display), `formatDate('2026-10-15') = ${display}`)

const short = formatDateShort('2026-10-15')
assert.ok(/^15\b/.test(short), `formatDateShort('2026-10-15') = ${short}`)

// ISO con hora: parseo instant historico conservado (no string crudo)
const instant = formatDate('2026-10-15T03:00:00Z')
assert.ok(/^1[45]\b/.test(instant), `formatDate(iso con hora) = ${instant}`)

// La fecha de la cuarentena GBP queda 15 en la bandeja (caso de la tarea)
const quar = formatDate('2026-10-15')
assert.ok(!/^14\b/.test(quar), 'la fecha calendario no debe desplazarse a 14')

console.log('PASS: dual-path de fecha display OK ->', display, '|', short, '|', instant)