// Test: parseCalendarDate trata YYYY-MM-DD como fecha calendario local,
// no como timestamp UTC (regresion: "2026-10-15" mostraba 14 de oct en UTC-3).
// Uso: node scripts/test_parse_calendar_date.mjs
import assert from 'node:assert'
import { parseCalendarDate } from '../src/lib/parseCalendarDate.ts'

// Caso del bug: 2026-10-15 debe renderizar 15 en cualquier timezone.
for (const tz of ['America/Argentina/Buenos_Aires', 'UTC', 'America/New_York', 'Pacific/Kiritimati']) {
  process.env.TZ = tz
  const d = parseCalendarDate('2026-10-15')
  assert.strictEqual(d.getFullYear(), 2026)
  assert.strictEqual(d.getMonth(), 9) // octubre 0-indexed
  assert.strictEqual(d.getDate(), 15)
  assert.strictEqual(d.getHours(), 0)
  assert.strictEqual(d.getMinutes(), 0)
}

// Mes corto y bisiesto: 2026-03-01 y 2024-02-29 nunca retroceden.
process.env.TZ = 'America/Argentina/Buenos_Aires'
const mar = parseCalendarDate('2026-03-01')
assert.strictEqual(`${mar.getFullYear()}-${String(mar.getMonth() + 1).padStart(2, '0')}-${String(mar.getDate()).padStart(2, '0')}`, '2026-03-01')
const feb = parseCalendarDate('2024-02-29')
assert.strictEqual(feb.getDate(), 29)
assert.strictEqual(feb.getMonth(), 1)

// Invalidos: null y basura fallan o devuelven algo marcado NaN, nunca una fecha desplazada.
assert.ok(Number.isNaN(parseCalendarDate('no-fecha').getTime()))
assert.ok(Number.isNaN(parseCalendarDate('2026-13-40').getTime()))

// La fecha que Date.parse interpreta en UTC NO se usa: el 15 no puede devenir 14.
const d = parseCalendarDate('2026-10-15')
assert.notStrictEqual(d.toISOString().startsWith('2026-10-14'), true)

console.log('PASS: parseCalendarDate mantiene el dia calendario en todas las zonas')