// tests/inversiones/detalle-acciones-layout.test.js
//
//   node --test tests/inversiones/detalle-acciones-layout.test.js
//
// S8 (ronda 7, dueño): "no me gusta como queda ahí con cuatro opciones todas
// apretadas en el menú flotante, así que con el tachito de basura solamente al
// lado del nombre de la inversión [...] bien a la derecha en la misma línea. Sin
// ningún nombre, solo el tachito de basura, y después reparte los otros tres
// menús flotantes en todo el ancho de la pantalla, así que le prolijo".
//
// Lo que se congela:
//   1. El borrado es un botón de ICONO dentro del header, sin texto visible y
//      con nombre accesible.
//   2. El pie de acciones tiene exactamente tres acciones (Actualizar valor,
//      Agregar capital, Liquidar) y ninguna es el borrado.
//   3. La confirmación sigue existiendo: mover el botón no puede dejar la acción
//      destructiva sin segundo paso.
//   4. El botón solo aparece en las posiciones que fn_eliminar_inversion acepta
//      (sin billetera de origen y sin movimientos).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const src = leer('src/components/inversiones/DetalleInversionView.tsx')
const css = leer('src/components/inversiones/DetalleInversionView.css')

/** El bloque JSX de un elemento, desde su apertura hasta el cierre indicado. */
function bloque(desde, hasta) {
  const inicio = src.indexOf(desde)
  assert.ok(inicio > -1, `no se encontró ${desde}`)
  const fin = src.indexOf(hasta, inicio)
  assert.ok(fin > -1, `no se encontró el cierre ${hasta}`)
  return src.slice(inicio, fin + hasta.length)
}

const header = bloque('<header className="detalle-header">', '</header>')
const footer = bloque('<footer className="detalle-actions">', '</footer>')

test('el tachito vive en el header, a la derecha del nombre', () => {
  assert.match(header, /className="detalle-header-delete"/, 'el botón de borrado va en el header')

  // Después del bloque del título: es lo que lo deja a la derecha, en la misma
  // línea, y no encima del nombre.
  const posTitulo = header.indexOf('detalle-header-text')
  const posBoton = header.indexOf('detalle-header-delete')
  assert.ok(posTitulo > -1 && posBoton > posTitulo, 'el botón va después del título')
})

test('es solo un icono: no muestra el nombre de la acción', () => {
  const boton = bloque('className="detalle-header-delete"', '</button>')

  assert.match(boton, /<Trash2/, 'el icono es la papelera')
  assert.match(
    boton,
    /aria-label=\{t\('btn_delete_investment'\)\}/,
    'el nombre accesible sale de la traducción',
  )
  // Nada de texto: el pedido fue "sin ningún nombre, solo el tachito".
  assert.doesNotMatch(
    boton,
    /<span>[^<]*\{\s*t\(/,
    'el botón no puede renderizar texto de la acción',
  )
  assert.doesNotMatch(boton, /🗑/, 'no vuelve el emoji de papelera con etiqueta')
})

test('el pie de acciones reparte las otras tres, sin el borrado', () => {
  const acciones = footer.match(/className="detalle-action-btn detalle-action-btn--(update|add|liquidate)"/g) ?? []

  assert.deepEqual(
    [...new Set(acciones.map((a) => a.match(/--(\w+)"/)[1]))],
    ['update', 'add', 'liquidate'],
    'el pie tiene que tener exactamente las tres acciones que quedan',
  )
  assert.doesNotMatch(
    footer,
    /detalle-action-btn detalle-action-btn--delete/,
    'el borrado ya no se dibuja en el pie',
  )
})

test('las tres acciones del pie ocupan todo el ancho a partes iguales', () => {
  const cssBoton = css.match(/\.detalle-action-btn\s*\{[\s\S]*?\}/)
  assert.ok(cssBoton, 'la hoja debería declarar .detalle-action-btn')
  assert.match(cssBoton[0], /flex:\s*1/, 'cada acción crece a partes iguales')
})

test('el borrado sigue pidiendo confirmación', () => {
  assert.match(footer, /detalle-delete-confirm/, 'la confirmación se dibuja en el pie')
  assert.match(footer, /confirm_delete_investment/, 'la confirmación explica qué se borra')
  assert.match(src, /onClick=\{handleDelete\}/, 'el borrado real sigue siendo handleDelete')
})

test('solo se ofrece borrar cuando el backend lo va a aceptar', () => {
  // Una sola fuente para la condición: la usan el botón y la confirmación.
  assert.match(
    src,
    /const puedeBorrar = data\.billetera_origen_id === null && historial\.length === 0/,
    'la condición tiene que estar calculada una sola vez',
  )
  assert.match(header, /\{puedeBorrar && \(/, 'el botón del header usa la condición')
  assert.match(footer, /\{puedeBorrar && confirmBorrar && \(/, 'la confirmación usa la condición')
})
