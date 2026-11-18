// tests/presupuestos/sin-asignar-en-subcategorias.test.js
//
//   node --test tests/presupuestos/sin-asignar-en-subcategorias.test.js
//
// Ronda 14 (dueño): la plata se asigna al rubro padre. El servidor ya rechaza
// cualquier monto positivo sobre una subcategoría con
// {"key":"error_budget_child_holds_no_money","params":{}}.
//
// Lo que se congela acá:
//   1. La fila de una subcategoría NO ofrece el botón «Asignar»; el rubro padre y el
//      rubro suelto siguen asignando exactamente como antes.
//   2. Sin botón no se reserva su lugar: el hueco de 84 px de `.sobre-fila-top` se
//      cancela, así la fila no queda desalineada ni el nombre recortado en 390 px.
//      La franja de datos (`.sobre-stats`) se sigue dibujando en todas las filas.
//   3. Si la hoja de asignación se alcanza igual sobre una subcategoría (otro call
//      site), se avisa con el texto traducido y nunca con la key cruda del servidor.
//   4. El texto existe en los tres diccionarios, dice que la plata va al rubro padre y
//      que la subcategoría recibe un techo, y no lleva parámetros (el servidor manda
//      `params: {}`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { inversiones as es } from '../../src/locales/es.ts'
import { inversiones as en } from '../../src/locales/en.ts'
import { inversiones as pt } from '../../src/locales/pt.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

// El checkout de Windows trae CRLF; los cortes de bloque buscan '\n'.
const leer = (...partes) =>
  fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')

const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')

const CLAVE = 'error_budget_child_holds_no_money'

const bloque = (desdeTexto, cierre = '\n}\n') => {
  const desde = pagina.indexOf(desdeTexto)
  assert.ok(desde > -1, `no encontré ${desdeTexto}`)
  const fin = pagina.indexOf(cierre, desde)
  assert.ok(fin > desde, `no encontré el cierre de ${desdeTexto}`)
  return pagina.slice(desde, fin)
}

// ─── 1. Qué fila puede asignar ───────────────────────────────────────────────

test('una fila es subcategoría cuando su categoría tiene padre, y un padre no lo es', () => {
  const helper = bloque('function esSubcategoriaDeRubro')
  // La condición es exactamente «tiene padre y no es rubro padre»: el rubro padre y el
  // rubro suelto quedan afuera, que es lo que el dueño pidió preservar.
  assert.match(
    helper,
    /return sobre\.padre_id != null && !sobre\.es_padre/,
    'la subcategoría se deriva de padre_id, sin campos nuevos',
  )
  // `padre_id` ya viene de fn_reporte_sobres_detalle: nada de fetches nuevos.
  assert.match(
    pagina,
    /interface SobreDetalle \{[\s\S]*?padre_id: number \| null[\s\S]*?es_padre\?: boolean[\s\S]*?\n\}/,
    'padre_id y es_padre son los datos que la fila ya tiene',
  )
})

test('el botón Asignar se dibuja sólo cuando la fila no es subcategoría', () => {
  const fila = bloque('function FilaSobre(')
  assert.match(fila, /const esSubcategoria = esSubcategoriaDeRubro\(sobre\)/)
  assert.match(
    fila,
    /const puedeAsignar = !soloLectura && !esSubcategoria/,
    'el gate suma la subcategoría al ciclo cerrado que ya existía',
  )
  assert.match(
    fila,
    /\{puedeAsignar && \(\s*<button className="sobre-btn-asignar"/,
    'el botón vive dentro del gate: sin gate vuelve el botón en la fila hija',
  )
  assert.equal(
    (fila.match(/className="sobre-btn-asignar"/g) ?? []).length,
    1,
    'un solo botón de asignar por fila',
  )
})

test('las demás acciones de la fila no cambian', () => {
  // El padre y la hija siguen recibiendo su onAsignar como hasta hoy: lo que cambia es
  // si el botón se dibuja, no el cableado de la fila.
  assert.match(pagina, /onAsignar=\{\(\) => onAsignar\(cabecera\)\}/)
  assert.match(pagina, /onAsignar=\{\(\) => onAsignar\(hija\)\}/)
  const fila = bloque('function FilaSobre(')
  assert.match(fila, /onClick=\{onVerDetalle\}/, 'la fila sigue abriendo el detalle')
  assert.match(fila, /onClick=\{e => \{ e\.stopPropagation\(\); onVerDetalle\(\) \}\}/)
})

// ─── 2. Sin botón, sin hueco reservado ───────────────────────────────────────

test('sin botón se cancela el espacio que el botón reservaba', () => {
  // El botón es absoluto (right 14, top 14) y su lugar se reserva con padding. Esa
  // reserva es el hueco que dejaba la fila hija sin botón.
  assert.match(
    css,
    /\.sobre-fila-top \{[\s\S]*?padding-right: 84px;/,
    'la reserva sale del CSS: si se movió de lugar, este test tiene que enterarse',
  )
  assert.match(
    pagina,
    /style=\{puedeAsignar \? undefined : \{ paddingRight: 0 \}\}/,
    'la fila sin botón no puede seguir reservando 84 px a la derecha',
  )
})

test('la franja de datos se sigue dibujando en todas las filas', () => {
  // El arreglo del hueco no puede tocar los datos: Asignado / Techo / Gastado / Avance
  // son los mismos en padre, suelto y subcategoría.
  const fila = bloque('function FilaSobre(')
  assert.match(
    fila,
    /className=\{`sobre-stats sobre-stats--columnas\$\{sobre\.es_padre \? ' sobre-stats--padre' : ''\}`\}/,
    'la franja de datos no se condiciona a puedeAsignar',
  )
  assert.ok(
    fila.indexOf('sobre-stats sobre-stats--columnas') > fila.indexOf('paddingRight: 0'),
    'el ajuste del hueco vive arriba, en la fila del nombre, no en los datos',
  )
  for (const etiqueta of ['budget_stat_assigned', 'budget_stat_ceiling', 'budget_stat_spent']) {
    assert.match(fila, new RegExp(`t\\('${etiqueta}'\\)`), `falta ${etiqueta} en la franja`)
  }
})

// ─── 3. La hoja no se abre sobre una subcategoría ────────────────────────────

test('abrir la asignación sobre una subcategoría avisa y no abre la hoja', () => {
  const abrir = bloque('const handleAbrirAsignar =', '\n  }\n')
  assert.match(abrir, /esSubcategoriaDeRubro\(sobre\)/, 'la guarda tiene que estar acá')
  assert.match(
    abrir,
    new RegExp(`showToast\\(t\\('${CLAVE}'\\), 'error'\\)`),
    'el aviso es el texto traducido, no la key cruda',
  )
  const guarda = abrir.indexOf(`t('${CLAVE}')`)
  const apertura = abrir.indexOf('setShowAsignarSheet(true)')
  assert.ok(guarda > -1 && apertura > -1 && guarda < apertura, 'la guarda corta antes de abrir')
})

test('el rechazo del servidor se traduce en un solo lugar', () => {
  const rechazo = bloque('function mensajeRechazoPresupuesto')
  assert.match(
    rechazo,
    new RegExp(`parsed\\?\\.key === '${CLAVE}'`),
    'la key del servidor tiene que estar contemplada',
  )
  assert.match(
    rechazo,
    new RegExp(`return t\\('${CLAVE}'\\)`),
    'se devuelve el texto traducido',
  )
  // `ejecutarAsignacion` ya pasa por este traductor antes del mensaje genérico.
  const ejecutar = bloque('const ejecutarAsignacion = async', '\n  }\n')
  const traduccion = ejecutar.indexOf('mensajeRechazoPresupuesto(err, t, formatMonto)')
  const generico = ejecutar.indexOf("t('budget_error_assign')")
  assert.ok(traduccion > -1 && generico > traduccion, 'el traductor gana sobre el genérico')
})

// ─── 4. El texto en los tres idiomas ─────────────────────────────────────────

const diccionarios = { es, en, pt }

test('los tres diccionarios publican la clave del rechazo', () => {
  for (const [lang, dic] of Object.entries(diccionarios)) {
    const texto = dic[CLAVE]
    assert.equal(typeof texto, 'string', `${lang}: falta la clave`)
    assert.ok(texto.trim().length > 20, `${lang}: el texto está vacío`)
    // El servidor manda `params: {}`: un placeholder quedaría sin reemplazar en la UI.
    assert.ok(!/\{[a-z_]+\}/i.test(texto), `${lang}: no lleva parámetros`)
  }
})

test('cada idioma dice lo que tiene que decir, en su idioma', () => {
  assert.match(diccionarios.es[CLAVE], /rubro padre/i, 'es: nombra el rubro padre')
  assert.match(diccionarios.es[CLAVE], /techo/i, 'es: la subcategoría recibe un techo')
  assert.match(diccionarios.en[CLAVE], /parent category/i, 'en: nombra la categoría padre')
  assert.match(diccionarios.en[CLAVE], /ceiling/i, 'en: la subcategoría recibe un techo')
  assert.match(diccionarios.pt[CLAVE], /categoria pai/i, 'pt: nombra a categoria pai')
  assert.match(diccionarios.pt[CLAVE], /teto/i, 'pt: a subcategoria recebe um teto')

  // Traducciones de verdad: ninguna copia el texto de otra.
  assert.notEqual(diccionarios.en[CLAVE], diccionarios.es[CLAVE])
  assert.notEqual(diccionarios.pt[CLAVE], diccionarios.es[CLAVE])
  assert.notEqual(diccionarios.pt[CLAVE], diccionarios.en[CLAVE])
})

test('el componente no hardcodea el texto en español (regla 9)', () => {
  assert.ok(
    !pagina.includes(diccionarios.es[CLAVE]),
    'el texto viaja por i18n, no pegado en el TSX',
  )
  assert.match(
    pagina,
    new RegExp(`t\\('${CLAVE}'\\)`),
    'el componente pide el texto por su clave',
  )
})
