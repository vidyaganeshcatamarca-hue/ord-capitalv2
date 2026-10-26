// tests/inversiones/tipografia-mensajes-detalle.test.js
//
//   node --test tests/inversiones/tipografia-mensajes-detalle.test.js
//
// S3 del dueño (2026-10-24): "Dentro de la inversión, con los detalles de la misma, el
// campo 'real yield' figura que no está configurada para esa moneda. El problema que
// tenemos acá es el tipo de letra, la tipología que estás usando. No coincide con la
// tipografia que estamos usando en toda la app."
//
// El mensaje ("Todavía no hay datos de inflación para tu moneda") heredaba la familia
// de los números (`--font-mono`) de `.detalle-yield` y encima iba en itálica: una frase
// explicativa se leía como un comentario de código. El mismo mensaje en el widget de
// rendimiento ya usaba la tipografía de cuerpo, así que el detalle era el outlier.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const css = fs.readFileSync(
  path.join(repo, 'src/components/inversiones/DetalleInversionView.css'),
  'utf-8'
)

const ruleFor = (selector) => {
  const i = css.indexOf(selector + ' {')
  assert.ok(i > 0, `falta la regla ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}

test('el mensaje de "sin datos" usa la tipografía de cuerpo, no la de los números', () => {
  const regla = ruleFor('.detalle-yield--na')
  assert.match(regla, /font-family:\s*var\(--font-body\)/)
  assert.ok(
    !/font-family:[^;]*font-mono/.test(regla),
    'no puede heredar la monoespaciada de los números'
  )
})

test('el mensaje ya no va en itálica', () => {
  const regla = ruleFor('.detalle-yield--na')
  assert.ok(!/font-style:\s*italic/.test(regla), 'es una frase, no un comentario')
  assert.match(regla, /font-style:\s*normal/)
})

test('los números del detalle sí siguen en su familia monoespaciada', () => {
  // El arreglo es del mensaje, no de los montos: cambiarlos alteraría toda la tarjeta.
  assert.match(ruleFor('.detalle-metric-value'), /font-family:\s*var\(--font-mono/)
  assert.match(ruleFor('.detalle-yield'), /font-family:\s*var\(--font-mono/)
})

test('el widget de rendimiento ya usaba cuerpo: los dos mensajes coinciden', () => {
  const widget = fs.readFileSync(
    path.join(repo, 'src/components/inversiones/RendimientoRealWidget.css'),
    'utf-8'
  )
  const i = widget.indexOf('.rendimiento-real-yield--na {')
  assert.ok(i > 0)
  const regla = widget.slice(i, widget.indexOf('}', i))
  assert.match(regla, /font-family:\s*var\(--font-body\)/)
})
