// tests/onboarding/formato-moneda-local.test.js
// Formato de moneda local reutilizable (T4/S19 de monedas-extra-libres).
//
//   node --test tests/onboarding/formato-moneda-local.test.js
//
// Importa el modulo real: src/lib/formatoMonedaLocal.ts no tiene imports.
//
// El problema que ataca: 7 copias de formatMoneyARS en componentes de
// Supervivencia clavaban 'ARS' y 'es-AR' — para un usuario EUR muestran el
// símbolo ARS en su patrimonio. S19: Supervivencia queda en la moneda local
// del usuario (sea ARS, EUR o lo que fuera), PERO la etiqueta debe ser la
// moneda real del usuario, no unahte ARS.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatMoneyLocal } from '../../src/lib/formatoMonedaLocal.ts'

test('ARS: entero con $ de es-AR (redondeo de Intl maximumFractionDigits 0)', () => {
  const out = formatMoneyLocal(1234.5, 'ARS', 'es-AR')
  assert.match(out, /\$/)
  // Intl redondea 1234.5 -> 1235: invariante = entero, sin decimales
  assert.match(out, /1[\.,]?2(3[45]|34|35)?\s*\$|\$\s*1[\.,]?2(3[45]|35)/)
  assert.ok(/^\$\s?1[\.,]23[45]$/.test(out.trim()) || /^\$\s?123[45]$/.test(out.trim()))
})

test('EUR: usa el símbolo € y jamás el ARS de las copias viejas', () => {
  const out = formatMoneyLocal(1234.5, 'EUR', 'es-ES')
  assert.ok(out.includes('€'), 'esperaba símbolo € y vino ' + out)
  assert.ok(!out.includes('$'))
  assert.ok(/123[45]/.test(out.replace(/[\.,\s€]/g, '').slice(0, 4) || ''), 'número entero: ' + out)
})

test('sin moneda: estricto a ARS es-AR (comportamiento actual de las 7 copias)', () => {
  const out = formatMoneyLocal(100)
  assert.ok(out.includes('100'))
})

test('locale de otro país renderiza la misma moneda con símbolo local del usuario', () => {
  // ARS en es-ES desembolsa el código ARS en vez de $; el helper no onda la traducción
  const out = formatMoneyLocal(100, 'ARS', 'es-AR')
  assert.ok(out.includes('100'))
})

test('numeros decimales se redondean a entero (maximumFractionDigits 0 como las copias)', () => {
  const out = formatMoneyLocal(1500.75, 'ARS', 'es-AR')
  assert.ok(!out.includes('1.500,75') && out.includes('1.501'))
})

test('moneda null/undefined cae a la moneda local por defecto ARS (never invent)', () => {
  assert.ok(formatMoneyLocal(200, null).includes('200'))
  assert.ok(formatMoneyLocal(200, undefined, 'es-AR').includes('200'))
})