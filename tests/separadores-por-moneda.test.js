// tests/separadores-por-moneda.test.js
// Formato numérico del dinero y de los porcentajes.
//
//   node --test tests/separadores-por-moneda.test.js
//
// Historia de la regla (el dueño la corrigió dos veces):
//   - S18 (2026-10-23, primera versión): cada moneda con SUS separadores.
//   - S21 (2026-10-23, corrección, verbatim): "no podemos tener separadores de
//     miles y decimales por moneda. No es correcto. Lo correcto es que el usuario
//     regional elige cómo quiere ver todas sus billeteras con los mismos
//     separadores... Manda el separador local para toda la aplicación."
//
// Entonces, hoy:
//   - los SEPARADORES (miles y decimal) son uno solo, el de la moneda local, y
//     valen para todas las monedas;
//   - los DECIMALES (cuántos) siguen siendo por moneda, porque son precisión y no
//     presentación;
//   - los porcentajes usan el separador decimal local (son valores genéricos).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { formatCurrency, formatPercent, setFormatContext } = await import(
  '../src/lib/format.ts'
)

/** Deja el contexto como lo publica el hook. */
function contexto({
  locale = 'es-AR',
  local = 'ARS',
  decimalLocal = ',',
  milesLocal = '.',
  decimalesLocal = 0,
  decimalesSegunda = 1,
  formats = {},
} = {}) {
  setFormatContext({
    locale,
    localCurrency: local,
    decimalsLocal: decimalesLocal,
    decimalsSecondary: decimalesSegunda,
    decimalSeparator: decimalLocal,
    thousandSeparator: milesLocal,
    currencyFormats: formats,
  })
}

// ───────────────── S21: un separador, el local, para todo ────────────────────

test('todas las monedas usan el separador de la moneda local', () => {
  contexto({
    local: 'GBP',
    decimalLocal: '.',
    milesLocal: ',',
    decimalesLocal: 2,
    decimalesSegunda: 2,
    formats: {
      GBP: { group: ',', decimal: '.', decimals: 2 },
      // BRL tiene otros separadores guardados de la tanda anterior: se ignoran.
      BRL: { group: '.', decimal: ',', decimals: 2 },
    },
  })

  assert.ok(
    formatCurrency(1600.5, 'BRL').includes('1,600.50'),
    `BRL debe usar el separador de la local: ${formatCurrency(1600.5, 'BRL')}`
  )
  assert.ok(
    !formatCurrency(1600.5, 'BRL').includes('1.600,50'),
    'BRL no debe usar separadores propios'
  )
})

test('con la local en coma, el dólar también sale en coma', () => {
  contexto({ local: 'ARS', decimalLocal: ',', milesLocal: '.', decimalesLocal: 2, decimalesSegunda: 2 })
  const usd = formatCurrency(1234.5, 'USD')
  assert.ok(usd.includes('1.234,50'), `USD debe seguir a la local: ${usd}`)
})

test('sin mapa pero con preferencias regionales, manda la preferencia', () => {
  contexto({ local: 'ARS', decimalLocal: ',', milesLocal: '.', decimalesLocal: 0, formats: {} })
  const ars = formatCurrency(1234.5, 'ARS')
  assert.ok(ars.includes('1.235'), `debe agrupar con el separador elegido: ${ars}`)
})

test('si no hay nada configurado, decide Intl (comportamiento histórico)', () => {
  contexto({ locale: 'en-US', local: 'USD', decimalLocal: '', milesLocal: '', decimalesLocal: 2 })
  const usd = formatCurrency(1234.5, 'USD')
  assert.ok(usd.includes('1,234.5'), `sin configuración manda el locale: ${usd}`)
})

test('el símbolo, su posición y el signo no se tocan', () => {
  contexto({ local: 'ARS', decimalLocal: ',', milesLocal: '.', decimalesLocal: 2 })
  const negativo = formatCurrency(-1234.5, 'ARS')
  assert.ok(negativo.includes('-'), `debe conservar el signo: ${negativo}`)
  assert.ok(negativo.includes('$'), `debe conservar el símbolo: ${negativo}`)
  assert.ok(negativo.indexOf('$') < negativo.indexOf('1'), 'el símbolo sigue adelante')
})

test('sin valor no se inventa un número', () => {
  contexto()
  assert.equal(formatCurrency(undefined), '-')
  assert.equal(formatCurrency('no-es-un-numero'), '-')
  // `null` se formateaba como 0 antes de todo esto y se deja igual: cambiarlo
  // toca 48 llamadores y no es parte de la regla.
  assert.match(formatCurrency(null), /^\$\s0$/)
})

// ─────────────── decimales: siguen siendo por moneda (precisión) ─────────────

test('cada moneda mantiene SUS decimales aunque comparta los separadores', () => {
  contexto({
    local: 'GBP',
    decimalLocal: '.',
    milesLocal: ',',
    decimalesLocal: 2,
    formats: {
      GBP: { group: ',', decimal: '.', decimals: 2 },
      BRL: { group: ',', decimal: '.', decimals: 0 },
      ARS: { group: ',', decimal: '.', decimals: 3 },
    },
  })

  assert.ok(formatCurrency(1500, 'GBP').includes('1,500.00'), 'GBP con 2 decimales')
  assert.ok(formatCurrency(1500, 'BRL').includes('1,500'), 'BRL con 0 decimales')
  assert.ok(
    !/1,500\.\d/.test(formatCurrency(1500, 'BRL')),
    'BRL no debe llevar centavos'
  )
  assert.ok(formatCurrency(1500.1234, 'ARS').includes('1,500.123'), 'ARS con 3 decimales')
})

test('una moneda sin decimales propios conserva la regla histórica', () => {
  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'ARS',
    decimalsLocal: 0,
    decimalsSecondary: 1,
    decimalSeparator: ',',
    thousandSeparator: '.',
    currencyFormats: {},
  })
  const usd = formatCurrency(200.35, 'USD')
  assert.ok(usd.includes('200,4'), `USD conserva 1 decimal: ${usd}`)
})

test('los decimales fuera de rango se recortan a 0..4', () => {
  contexto({
    local: 'ARS',
    decimalesLocal: 2,
    formats: { ARS: { group: '.', decimal: ',', decimals: 9 } },
  })
  const texto = formatCurrency(1.123456789, 'ARS')
  const decimales = (texto.split(',')[1] || '').replace(/[^\d]/g, '')
  assert.ok(decimales.length <= 4, `nunca más de 4 decimales: ${texto}`)
})

// ───────────────────────────── porcentajes ──────────────────────────────────

test('los porcentajes usan el separador decimal local', () => {
  contexto({ local: 'ARS', decimalLocal: ',', milesLocal: '.' })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
  assert.equal(formatPercent(6.665), '+6,67%')

  contexto({ local: 'GBP', decimalLocal: '.', milesLocal: ',' })
  assert.equal(formatPercent(12.62, { signed: false }), '12.62%')
  assert.equal(formatPercent(6.665), '+6.67%')
})

test('un porcentaje no toma el separador de la moneda del activo', () => {
  contexto({
    local: 'ARS',
    decimalLocal: ',',
    milesLocal: '.',
    formats: { USD: { group: ',', decimal: '.' } },
  })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
})

// ─────────────────── el arreglo no se desparrama ni se pierde ────────────────

test('el arreglo vive en el formateador compartido, no en los componentes', () => {
  const dir = path.join(repo, 'src', 'components', 'inversiones')
  for (const archivo of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const src = read(`src/components/inversiones/${archivo}`)
    assert.ok(
      !src.includes('formatToParts'),
      `${archivo} no debe resolver separadores por su cuenta: eso es de lib/format`
    )
    assert.ok(
      !/function formatPercent\(/.test(src),
      `${archivo} no debe definir su propio formatPercent`
    )
  }

  const format = read('src/lib/format.ts')
  assert.match(format, /function separatorsFor\(/, 'lib/format resuelve los separadores')
  assert.match(format, /formatToParts\(/, 'y lo hace sin rearmar el string')
})

test('el hook publica el separador regional y el mapa por moneda', () => {
  const hook = read('src/hooks/useNumberFormat.ts')
  assert.match(hook, /fn_obtener_formato_moneda/, 'lee el formato por moneda del backend')
  assert.match(hook, /thousandSeparator: prefs\.separador_miles/, 'publica el separador de miles')
  assert.match(hook, /decimalSeparator: prefs\.separador_decimal/, 'y el decimal')
  assert.match(hook, /currencyFormats/, 'y el mapa, que ahora solo aporta decimales')
})
