// tests/presupuestos/deficit-y-avance-sin-topes.test.js
//
//   node --test tests/presupuestos/deficit-y-avance-sin-topes.test.js
//
// Siete defectos medidos en un viewport móvil real de 390 px, con un grupo cuyo pozo está
// en −326.227,4: asignado 193.014,63 y gastado 519.242,03. La fila del padre imprimía
// «Sin asignar ARS 0» y «Avance 100%» mientras el bloque de arriba ya decía −ARS 326.227.
// O sea: el déficit existía una vez y la fila lo escondía.
//
// Lo que se congela acá:
//   1. El margen compartido va CON SIGNO (el piso en cero escondía el déficit), y las
//      hermanas siguen viendo el mismo número.
//   2. El avance NO se topea: 269% es el dato. Lo que se recorta es el ancho del relleno,
//      y arriba de un umbral el número se imprime acotado con una clave propia.
//   3. Una subcategoría sin techo muestra ese margen con signo, no un cero.
//   4. La franja del padre es dos y dos, sin raya vertical huérfana.
//   5. La hoja de detalle no imprime 100% cuando lo asignado es 0: sin base no hay cuota.
//   6. La franja azul del pozo se pinta debajo del relleno: el rojo manda.
//   7. El historial imprime los montos del registro y un guion cuando el valor es nulo.
//
// Las reglas numéricas se ejecutan importando el módulo de la barra; las de layout y de
// texto leen el fuente, como el resto de tests/presupuestos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { margenCompartidoDeSobre, porcentajeAvance } from '../../src/lib/barraSobre.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

// El checkout de Windows trae CRLF; los cortes de bloque buscan '\n'.
const leer = (...partes) =>
  fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')

const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')

const FILA = pagina.slice(pagina.indexOf('function FilaSobre({'), pagina.indexOf('function InfoBubble'))
const HOJA = pagina.slice(
  pagina.indexOf('showDetalleSheet && sobreSeleccionado'),
  pagina.indexOf('MODAL: BOTTOM SHEET ASIGNAR'),
)
const HIST = pagina.slice(
  pagina.indexOf('<div className="presupuesto-historial">'),
  pagina.indexOf('MODAL: BOTTOM SHEET ASIGNAR'),
)

// ─── 1. El margen compartido va con signo ────────────────────────────────────

test('el margen compartido conserva el signo del pozo del padre', () => {
  // Caso medido: Alimentos-Hogar con el pozo en −326.227,4.
  assert.equal(margenCompartidoDeSobre({ monto_disponible: -326_227.4 }), -326_227.4)
  assert.equal(margenCompartidoDeSobre({ monto_disponible: 0 }), 0)
  assert.equal(margenCompartidoDeSobre({ monto_disponible: 12_000 }), 12_000)
  // Sin pozo informado el margen es cero, no NaN.
  assert.equal(margenCompartidoDeSobre({ monto_disponible: null }), 0)
  // Sin padre no hay margen compartido que mostrar.
  assert.equal(margenCompartidoDeSobre(null), null)
  assert.equal(margenCompartidoDeSobre(undefined), null)
})

test('la fila del padre muestra el déficit, no un cero', () => {
  // La celda «Sin asignar» del padre usa el formateador con signo: el piso anterior
  // imprimía 0 sobre un pozo de −326.227.
  assert.match(
    FILA,
    /\{montoConSigno\(libreGrupo\)\}/,
    'la celda sin asignar del padre tiene que imprimir el margen con su signo',
  )
  assert.ok(
    !FILA.includes('fmt(Math.max(libreGrupo, 0))'),
    'el piso en cero es exactamente el defecto: escondía el déficit',
  )
  assert.match(
    FILA,
    /const montoConSigno = \(n: number\) => \(n >= 0 \? fmt\(n\) : `-\$\{fmt\(Math\.abs\(n\)\)\}`\)/,
    'el signo lo pone un solo formateador, el mismo del total del grupo',
  )
})

test('las subcategorías sin techo muestran ese mismo margen, con signo', () => {
  const valorTecho = FILA.slice(FILA.indexOf('const valorTecho'), FILA.indexOf('const valorTecho') + 300)
  assert.match(
    valorTecho,
    /libreGrupo !== undefined \? montoConSigno\(libreGrupo\) : '—'/,
    'sin techo, la celda muestra el margen compartido CON SIGNO',
  )
  // El mismo número para todas: la fila no recalcula nada, lo recibe del grupo.
  const pases = pagina.match(/libreGrupo=\{libreDe\(cabecera\.estructura_id\) \?\? undefined\}/g) ?? []
  assert.equal(pases.length, 1, 'la hija recibe el margen del grupo, no uno propio')
  const paseCabecera = /libreGrupo=\{cabecera\.es_padre \? libreDe\(cabecera\.estructura_id\) \?\? undefined : undefined\}/
  assert.match(pagina, paseCabecera, 'la cabecera recibe el mismo margen')
})

test('el piso queda sólo donde el cero es una respuesta', () => {
  // Aportar a una transferencia no puede ser negativo: ahí el recorte es correcto.
  const fondoLibre = pagina.slice(pagina.indexOf('const fondoLibreDe ='), pagina.indexOf('const fondoLibreDe =') + 600)
  assert.match(fondoLibre, /Math\.max\(techo - repartido, 0\)/, 'el fondo transferible sigue recortado en cero')
  // Y no se puede asignar un monto negativo para cubrir un hueco.
  const hueco = pagina.slice(pagina.indexOf('const handleLlenarHueco ='), pagina.indexOf('const handleLlenarHueco =') + 900)
  assert.match(hueco, /Math\.max\(0, saldoAsignar\)/, 'cubrir el hueco sigue sin poder usar un disponible negativo')
})

// ─── 2. El avance no se topea ────────────────────────────────────────────────

test('el número del avance llega sin tope: 269% es el dato', () => {
  assert.equal(porcentajeAvance(519_242.03, 193_014.63), 269)
  // Contra un techo chiquito el número es enorme y también es real (28.262%).
  assert.equal(porcentajeAvance(1_413_100, 5_000), 28_262)
})

test('el tope de 100 queda en el relleno, nunca en el número', () => {
  assert.match(
    FILA,
    /const relleno = avance === null \? 0 : Math\.min\(avance, 100\)/,
    'el relleno es lo único que se recorta: una barra no mide más que su ancho',
  )
  assert.match(FILA, /style=\{\{ width: `\$\{relleno\}%` \}\}/, 'el ancho de la barra usa el relleno acotado')
  assert.ok(
    !FILA.includes('Math.min(Math.round((gastado / asignado) * 100), 100)'),
    'el helper que topeaba el número ya no puede existir',
  )
  assert.ok(!pagina.includes('getPctBarra'), 'getPctBarra era el que devolvía 100 cuando no había contra qué medir')
})

test('un número ilegible se imprime acotado, con clave propia', () => {
  assert.match(pagina, /const AVANCE_MAXIMO_LEGIBLE = 999\n/, 'el umbral es una constante con nombre')
  const etiqueta = pagina.slice(pagina.indexOf('function etiquetaAvance('), pagina.indexOf('function etiquetaAvance(') + 600)
  assert.match(
    etiqueta,
    /if \(pct > AVANCE_MAXIMO_LEGIBLE\) return t\('budget_progress_over_max', \{ max: AVANCE_MAXIMO_LEGIBLE \}\)/,
    'arriba del umbral el número se dice acotado y por una clave traducible',
  )
  assert.match(etiqueta, /return `\$\{pct\}%`/, 'por debajo del umbral se imprime el número real')
})

test('las dos claves nuevas existen en los tres diccionarios', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const dic = leer('src', 'locales', `${lang}.ts`)
    for (const clave of ['budget_progress_no_quota', 'budget_progress_over_max']) {
      assert.ok(dic.includes(`  ${clave}: "`), `falta ${clave} en ${lang}.ts`)
    }
    // El número acotado conserva su hueco: el tope viaja como parámetro, no pegado.
    assert.match(dic, /budget_progress_over_max: ">\{max\}%"/, `${lang}: la forma acotada lleva {max}`)
  }
})

// ─── 3. El avance con signo en la franja y en la hoja ───────────────────────

test('la franja del padre imprime el avance real, no 100%', () => {
  assert.match(
    FILA,
    /<span className="sobre-stat-val">\{avanceEtiqueta\}<\/span>/,
    'la celda de avance imprime lo que dice el helper, sin volver a topear',
  )
  assert.match(
    FILA,
    /const avanceEtiqueta = sinTecho\s*\?\s*'—'\s*:\s*etiquetaAvance\(Number\(sobre\.monto_gastado\), baseAvance\)/,
    'la etiqueta sale de etiquetaAvance con la base de la fila',
  )
  // El padre no lleva techo: su base es su propia plata, y ahí es donde el 269% aparece.
  assert.match(
    FILA,
    /const baseAvance = referenciaBarra && !sinTecho\s*\?\s*referenciaBarra\.techo\s*:\s*Number\(sobre\.monto_asignado \?\? 0\)/,
    'el padre mide contra su plata; la subcategoría, contra su techo',
  )
})

// ─── 5. La hoja de detalle no divide por cero ───────────────────────────────

test('sin asignación la hoja de detalle no imprime 100%', () => {
  // Caso medido: Asignado ARS 0 · Gastado ARS 279.362.
  assert.equal(porcentajeAvance(279_362, 0), null, 'sin base no hay porcentaje')
  assert.match(
    HOJA,
    /etiquetaAvance\(\s*Number\(sobreSeleccionado\.monto_gastado\),\s*Number\(sobreSeleccionado\.monto_asignado\)\s*\)/,
    'la hoja tiene que pasar por el helper que distingue «sin cuota» de «100%»',
  )
  assert.ok(
    !HOJA.includes('getPctBarra('),
    'la hoja no puede volver al helper que devolvía 100 con base cero',
  )
  const etiqueta = pagina.slice(pagina.indexOf('function etiquetaAvance('), pagina.indexOf('function etiquetaAvance(') + 600)
  assert.match(
    etiqueta,
    /if \(pct === null\) return t\('budget_progress_no_quota'\)/,
    'sin base se dice «sin cuota», no un porcentaje inventado',
  )
  // La hoja de detalle muestra el avance con su etiqueta, no un `%` pegado a mano.
  assert.ok(!/\}\)\}%/.test(HOJA), 'no queda un «%» pegado después del número')
})

// ─── 7. El historial muestra qué cambió ─────────────────────────────────────

test('el historial imprime el monto del registro, incluso cuando es cero', () => {
  // El gate anterior era `monto_limite !== 0`: una asignación a CERO no imprimía nada y
  // la entrada quedaba en «12 nov · Otro cambio».
  assert.ok(
    !HIST.includes('Number(fila.monto_limite ?? 0) !== 0'),
    'un cambio a cero es un cambio y tiene que verse',
  )
  assert.match(
    HIST,
    /t\('budget_history_money', \{ monto: montoHistorial\(fila\.monto_limite, formatMonto\) \}\)/,
    'la plata se imprime siempre, con guion cuando el registro no tiene valor',
  )
  assert.match(
    HIST,
    /t\('budget_history_ceiling', \{ monto: montoHistorial\(fila\.monto_techo, formatMonto\) \}\)/,
    'cuando el cambio tocó el techo, se imprime el techo',
  )
})

test('un valor nulo se dice con un guion, no con un hueco', () => {
  const helper = pagina.slice(pagina.indexOf('function montoHistorial('), pagina.indexOf('function montoHistorial(') + 400)
  assert.match(helper, /if \(valor === null \|\| valor === undefined\) return '—'/, 'nulo se imprime como guion')
  assert.match(helper, /return fmt\(Number\(valor\)\)/, 'con valor se imprime el monto formateado')
})

test('el motivo ocupa el renglón entero, sin corrimiento', () => {
  const motivo = css.slice(css.indexOf('.presupuesto-historial-motivo {'), css.indexOf('.presupuesto-historial-motivo {') + 300)
  assert.match(motivo, /grid-column:\s*1 \/ -1/, 'el motivo no puede quedar pegado a una columna que no existe')
})

// ─── 6. La franja azul no tapa el rojo ──────────────────────────────────────

test('el relleno se pinta por encima de la franja del pozo', () => {
  const fill = css.slice(css.indexOf('.sobre-barra-fill {'), css.indexOf('.sobre-barra-fill {') + 500)
  assert.match(fill, /position:\s*relative/, 'el relleno necesita su propio nivel de pintado')
  assert.match(fill, /z-index:\s*1/, 'sin nivel propio la franja azul lo tapa y la fila se lee azul')
  const pozo = css.slice(css.indexOf('.sobre-barra-pozo {'), css.indexOf('.sobre-barra-pozo {') + 400)
  assert.ok(!/z-index:\s*[1-9]/.test(pozo), 'la franja del pozo no puede quedar por encima del relleno')
})
