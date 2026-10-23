// tests/separadores-por-moneda.test.js
// Tanda 1 (spec S18): el dinero respeta el separador elegido POR MONEDA y los
// porcentajes el de la MONEDA LOCAL.
//
//   node --test tests/separadores-por-moneda.test.js
//
// Regla del dueño (verbatim): "El módulo debe seguir el separador elegido.
// Tenemos máximo tres monedas, cada moneda debe seguir su separador elegido. Y
// en el módulo de inversiones o cualquier otro, en donde se muestren
// porcentajes, se debe seguir el separador elegido para la moneda local. Cuando
// son valores genéricos, que no aplican a una moneda en particular, el separador
// elegido para la moneda local."
//
// El arreglo vive en DOS archivos (lib/format.ts y useNumberFormat.ts) y no toca
// ningún componente: los 48 llamadores de formatCurrency siguen igual.
//
// Lo más importante de este archivo es el primer test: cuando no hay separador
// configurado para la moneda, la salida tiene que ser IDÉNTICA a la de antes
// (locale puro). Si eso se rompe, se rompen 26 archivos.

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
function contexto({ locale = 'es-AR', local = 'ARS', separators = {}, decimal = ',' } = {}) {
  setFormatContext({
    locale,
    localCurrency: local,
    decimalsLocal: 0,
    decimalsSecondary: 1,
    decimalSeparator: decimal,
    currencySeparators: separators,
  })
}

// ───────────── el test que protege lo ya escrito (26 archivos) ──────────────

test('sin separadores configurados, la salida es la de siempre (locale puro)', () => {
  contexto({ separators: {} })

  // Comparación directa contra Intl: antes formatCurrency era exactamente esto.
  const casos = [
    [1234.56, 'ARS', 0],
    [200.3, 'USD', 1],
    [1234567.891, 'ARS', 0],
    [0, 'ARS', 0],
    [-500, 'BRL', 0],
  ]
  for (const [monto, moneda, digitos] of casos) {
    const esperado = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: digitos,
    }).format(Number(monto.toFixed(digitos)))
    assert.equal(
      formatCurrency(monto, moneda),
      esperado,
      `${monto} ${moneda} debe quedar igual que Intl`
    )
  }
})

// ─────────────────────── cada moneda con su separador ───────────────────────

test('cada moneda usa SU separador, no el de las demás', () => {
  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'ARS',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    decimalSeparator: ',',
    currencySeparators: {
      ARS: { group: '.', decimal: ',' },
      USD: { group: ',', decimal: '.' },
      BRL: { group: '.', decimal: ',' },
    },
  })

  // ARS: miles '.' y decimal ','.
  assert.ok(
    formatCurrency(1234.5, 'ARS').includes('1.234,5'),
    `ARS debe usar miles '.' y decimal ',': ${formatCurrency(1234.5, 'ARS')}`
  )
  // USD configurado con punto decimal: el caso que el dueño reportó.
  const usd = formatCurrency(1234.5, 'USD')
  assert.ok(usd.includes('1,234.5'), `USD debe usar punto decimal: ${usd}`)
  assert.ok(!usd.includes('1.234,5'), 'USD no debe heredar el formato de ARS')
})

test('una moneda sin entrada propia cae al separador de la moneda local', () => {
  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'GBP',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    decimalSeparator: ',',
    currencySeparators: { GBP: { group: ',', decimal: '.' } },
  })
  // EUR no tiene fila: se usa el de GBP.
  const eur = formatCurrency(1234.5, 'EUR')
  assert.ok(eur.includes('1,234.5'), `EUR debe heredar de la local: ${eur}`)
})

test('el símbolo, su posición y el signo no se tocan', () => {
  contexto({ separators: { ARS: { group: '.', decimal: ',' } } })
  const negativo = formatCurrency(-1234.5, 'ARS')
  assert.ok(negativo.includes('-'), `debe conservar el signo: ${negativo}`)
  assert.ok(negativo.includes('$'), `debe conservar el símbolo: ${negativo}`)
  // El símbolo va antes del número, igual que en el locale.
  assert.ok(negativo.indexOf('$') < negativo.indexOf('1'), 'el símbolo sigue adelante')
})

test('sin valor no se inventa un número', () => {
  contexto()
  assert.equal(formatCurrency(undefined), '-')
  assert.equal(formatCurrency('no-es-un-numero'), '-')
  // `null` se formateaba como 0 antes de este cambio y se deja igual: cambiarlo
  // toca 48 llamadores y no es parte de esta tanda.
  assert.equal(formatCurrency(null), '$ 0')
})

// ───────────────────────────── porcentajes ──────────────────────────────────

test('los porcentajes usan el separador de la moneda local', () => {
  contexto({ local: 'ARS', separators: { ARS: { group: '.', decimal: ',' } } })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
  assert.equal(formatPercent(6.665), '+6,67%')

  contexto({ local: 'USD', separators: { USD: { group: ',', decimal: '.' } } })
  assert.equal(formatPercent(12.62, { signed: false }), '12.62%')
  assert.equal(formatPercent(6.665), '+6.67%')
})

test('un porcentaje no toma el separador de la moneda del activo', () => {
  // El dueño lo dijo explícito: un porcentaje es genérico → moneda local.
  contexto({
    local: 'ARS',
    separators: { ARS: { group: '.', decimal: ',' }, USD: { group: ',', decimal: '.' } },
  })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
})

// ─────────────────────── el arreglo no se desparrama ───────────────────────

test('el arreglo vive en el formateador compartido, no en los componentes', () => {
  const dir = path.join(repo, 'src', 'components', 'inversiones')
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))
  for (const archivo of archivos) {
    const src = read(`src/components/inversiones/${archivo}`)
    assert.ok(
      !src.includes('formatToParts'),
      `${archivo} no debe resolver separadores por su cuenta: eso es de lib/format`
    )
  }

  const format = read('src/lib/format.ts')
  assert.match(format, /function separatorsFor\(/, 'lib/format resuelve los separadores')
  assert.match(format, /formatToParts\(/, 'y lo hace sin rearmar el string')
})

test('el hook publica el mapa por moneda del backend', () => {
  const hook = read('src/hooks/useNumberFormat.ts')
  assert.match(
    hook,
    /fn_obtener_formato_moneda/,
    'el hook debe leer el formato por moneda que ya existe en el backend'
  )
  assert.match(hook, /currencySeparators/, 'y publicarlo en el contexto de formato')
})
