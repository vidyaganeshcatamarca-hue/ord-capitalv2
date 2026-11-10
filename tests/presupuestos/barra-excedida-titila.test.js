// tests/presupuestos/barra-excedida-titila.test.js
//
//   node --test tests/presupuestos/barra-excedida-titila.test.js
//
// Dueño (2026-11-02): "almacén despensa tiene asignado y ha gastado toda su asignación,
// la línea roja es correcta, el avance es 100%, pero limpieza hogar no tiene nada
// asignado y tiene un saldo negativo [...] quiero diferenciar el sobre que se ha excedido
// del sobre que ha cubierto el total, entonces el cambio que te propongo es que la línea
// roja del sobre que se ha excedido la hagas titilar, prender y apagar [...] porque en un
// celular quizás no se nota muy bien la diferencia de color".
//
// El estado ya los distingue: `rojo_excedido` es propio y `getColorBarra` lo manda a
// rojo, mientras el que sólo cubrió el total queda en precaución. Lo que faltaba era la
// señal de movimiento, que se lee de un vistazo en una pantalla chica.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8')

const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')

test('la barra lleva la marca de excedido solo en ese estado', () => {
  assert.match(
    pagina,
    /sobre\.estado_sobre === 'rojo_excedido' \? ' excedido' : ''/,
    'la barra no distingue el sobre excedido del que solo cubrio el total',
  )
})

test('el titilado existe y es de prender y apagar', () => {
  assert.match(css, /\.sobre-barra-fill\.excedido\s*\{[^}]*animation:\s*sobre-barra-titila/, 'la barra excedida no titila')
  const bloque = css.slice(css.indexOf('@keyframes sobre-barra-titila'))
  assert.match(bloque.slice(0, 200), /opacity:\s*1/, 'el keyframe no la vuelve opaca')
  assert.match(bloque.slice(0, 200), /opacity:\s*0?\.\d+/, 'el keyframe no la apaga')
})

test('respeta a quien pidio menos movimiento', () => {
  const bloque = css.slice(css.indexOf('@keyframes sobre-barra-titila'))
  assert.match(bloque.slice(0, 400), /prefers-reduced-motion/, 'no hay guarda de movimiento reducido')
  assert.match(bloque.slice(0, 400), /animation:\s*none/, 'la guarda no apaga la animacion')
})

test('sin debilitar el color: el excedido sigue siendo rojo', () => {
  assert.match(pagina, /if \(estado === 'rojo_excedido'\) return 'rojo'/)
})
