// tests/onboarding/format-context.test.js
// `lib/format.ts` is used by ~22 files and used to be nailed to Argentina: locale
// 'es-AR', 0 decimals always, 'ARS' by default. These tests pin the new behaviour and,
// just as important, pin that the DEFAULT is still what it always was.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  setFormatContext,
  getFormatContext,
  formatCurrency,
  formatNumber,
} from '../../src/lib/format.ts'

/** Intl uses non-breaking spaces; normalise so assertions read naturally. */
const norm = (s) => String(s).replace(/[\u00A0\u202F\u2009]/g, ' ')

test('the default context is the historical Argentine one', () => {
  // A fresh module starts with the previous behaviour, so nothing changes for the
  // existing base until the region resolves.
  const ctx = getFormatContext()
  assert.equal(ctx.locale, 'es-AR')
  assert.equal(ctx.localCurrency, 'ARS')
  assert.equal(ctx.decimalsLocal, 0)
  assert.equal(ctx.decimalsSecondary, 1)
})

test('with no currency argument it formats the LOCAL currency, not ARS', () => {
  setFormatContext({
    locale: 'es-ES',
    localCurrency: 'EUR',
    decimalsLocal: 2,
    decimalsSecondary: 2,
  })
  // 5 digits on purpose: Spanish (es-ES) does not group 4-digit numbers, so 1234.5
  // formats as "1234,50 EUR" with no thousands separator. That is correct CLDR
  // behaviour, not a bug.
  const out = norm(formatCurrency(12345.5))
  assert.ok(out.includes('12.345,50'), `esperaba el monto con 2 decimales, vino ${out}`)
  assert.ok(out.includes('€'), `esperaba el simbolo del euro, vino ${out}`)
  assert.ok(!out.includes('$'), `no deberia haber simbolo de peso: ${out}`)
})

test('the second currency (USD) uses its own decimals', () => {
  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'ARS',
    decimalsLocal: 0,
    decimalsSecondary: 2,
  })
  const out = norm(formatCurrency(1234.5, 'USD'))
  assert.ok(out.includes('1.234,50'), `esperaba 2 decimales para USD, vino ${out}`)
})

test('zero-decimal currencies stay with no decimals', () => {
  setFormatContext({
    locale: 'es-PY',
    localCurrency: 'PYG',
    decimalsLocal: 0,
    decimalsSecondary: 2,
  })
  const out = norm(formatCurrency(1234.5))
  assert.ok(out.includes('1.235'), `esperaba el redondeo de PYG, vino ${out}`)
})

test('an explicit currency wins over the local one', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  const out = norm(formatCurrency(100, 'USD'))
  assert.ok(out.includes('100,00'), out)
})

test('an unknown currency code does not break the screen', () => {
  setFormatContext({ locale: 'es-AR', localCurrency: 'ARS', decimalsLocal: 0, decimalsSecondary: 1 })
  assert.doesNotThrow(() => formatCurrency(100, 'ZZZ'))
})

test('a non-numeric amount is a dash, not a crash', () => {
  assert.equal(formatCurrency('no es un numero'), '-')
  // null goes through `Number(null) === 0` and formats as zero; undefined becomes NaN
  // and is a dash. Both are the previous behaviour, and changing them here would alter
  // what screens show today, which is not this slice's business.
  assert.equal(norm(formatCurrency(null)), norm(formatCurrency(0)))
  assert.equal(formatCurrency(undefined), '-')
})

test('formatNumber keeps its own rule: no decimals', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  const out = norm(formatNumber(1234.5))
  assert.ok(!out.includes(','), `los conteos no llevan decimales: ${out}`)
})

test('lowercase and padded currency codes are accepted', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  assert.equal(norm(formatCurrency(100, ' usd ')), norm(formatCurrency(100, 'USD')))
})

// ── S6, ronda 4 (2026-10-24) ────────────────────────────────────────────────
// Dueño: "El usuario 198 [...] tiene configurado en la segunda moneda un decimal y
// en la tercera moneda cero decimales. [...] en billeteras, por ejemplo, de home y
// de cuentas, se muestra la configuración que tiene la moneda local, que son dos
// decimales. [...] no se está respetando que cada moneda muestra la cantidad de
// decimales que tiene configurado."
//
// La regla es una sola (`resolveDecimals`) y la comparten el formateador de contexto
// y el hook de las billeteras. Antes el hook tenía su propia copia binaria y quedó
// congelada: solo USD tenía decimales propios.
const { resolveDecimals } = await import('../../src/lib/format.ts')

test('cada moneda usa sus propios decimales, no los de la local', () => {
  const formats = { ARS: { decimals: 1 }, BRL: { decimals: 0 } }
  // Local GBP con 2 decimales: el caso real del usuario 198.
  assert.equal(resolveDecimals('ARS', formats, 2, 2), 1)
  assert.equal(resolveDecimals('BRL', formats, 2, 2), 0)
  // Sin entrada propia se mantiene la regla histórica: ningún usuario ve cambiar
  // sus números por este arreglo.
  assert.equal(resolveDecimals('GBP', formats, 2, 2), 2)
  assert.equal(resolveDecimals('USD', formats, 2, 1), 1)
})

test('los decimales fuera de rango se recortan a 0..4', () => {
  assert.equal(resolveDecimals('ARS', { ARS: { decimals: 9 } }, 2, 2), 4)
  assert.equal(resolveDecimals('ARS', { ARS: { decimals: -3 } }, 2, 2), 0)
  // Un valor no numérico no puede romper el formateo: cae al respaldo.
  assert.equal(resolveDecimals('ARS', { ARS: { decimals: NaN } }, 2, 2), 2)
})

test('el mapa por moneda llega al monto formateado', () => {
  setFormatContext({
    locale: 'es-ES',
    localCurrency: 'GBP',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    currencyFormats: { ARS: { decimals: 1 }, BRL: { decimals: 0 } },
  })
  assert.ok(norm(formatCurrency(1234.5, 'ARS')).includes('1.234,5'))
  assert.ok(!norm(formatCurrency(1234.5, 'ARS')).includes('1.234,50'))
  assert.ok(norm(formatCurrency(1234.5, 'BRL')).includes('1.235'))
})

// ── S6b, ronda 4 (2026-10-24) ───────────────────────────────────────────────
// El total del Home armaba el texto a mano con dos decimales fijos
// (toLocaleString(locale, {minimumFractionDigits:2, maximumFractionDigits:2})), así que
// el usuario 198 veía ARS 150,372.26 y R$ 18,702.52 en el total mientras sus billeteras
// ya mostraban 150,372.3 y 18,703. `formatCurrencyNumber` es el mismo formateo que
// formatCurrency pero sin símbolo, para los lugares que ponen el símbolo aparte.
const { formatCurrencyNumber } = await import('../../src/lib/format.ts')

test('el número sin símbolo respeta los decimales de cada moneda', () => {
  setFormatContext({
    locale: 'es-ES',
    localCurrency: 'GBP',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    currencyFormats: { ARS: { decimals: 1 }, BRL: { decimals: 0 } },
  })
  // Caso real del 198.
  assert.equal(norm(formatCurrencyNumber(150372.26, 'ARS')), '150.372,3')
  assert.equal(norm(formatCurrencyNumber(18702.52, 'BRL')), '18.703')
  // La moneda local conserva sus dos decimales. Agrupa los 4 dígitos porque el
  // contexto trae un separador de miles elegido y en ese caso el formateador usa
  // useGrouping: 'always' (el locale español solo no agruparía 1809).
  assert.equal(norm(formatCurrencyNumber(1809.91, 'GBP')), '1.809,91')
})

test('el número sin símbolo no arrastra el símbolo de la moneda', () => {
  const out = norm(formatCurrencyNumber(150372.26, 'ARS'))
  assert.ok(!/\bARS\b|£|\$|R\$/.test(out), `vino con símbolo: ${out}`)
})
