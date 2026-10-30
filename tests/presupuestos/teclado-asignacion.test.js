// tests/presupuestos/teclado-asignacion.test.js
//
//   node --test tests/presupuestos/teclado-asignacion.test.js
//
// Ronda de auditoría, F-05 (medio). El informe:
//
//   «la fila es div.sobre-fila[role="button"][tabindex="0"] y anida un
//    button.sobre-btn-asignar, es decir dos destinos de foco por fila. Peor: en la
//    hoja "Asignar presupuesto" las seis opciones son div.asignar-opcion sin role,
//    tabindex ni aria-*, así que un usuario de teclado no puede llegar a "Ingresar
//    Monto", "Llenar Hueco" ni "Cubrir desde Otro Sobre".»
//
// El dueño pidió arreglarlo.
//
// Lo que se congela:
//   1. Las seis opciones de la hoja son botones reales: se llega con Tab y se
//      activan con Enter o Espacio sin agregar ningún handler propio.
//   2. La fila del sobre ya no es un role="button" que anida otro botón.
//   3. El detalle sigue siendo alcanzable con el teclado: el nombre es un botón.
//   4. Los botones que cambiaron de elemento tienen su reset de estilo, para no
//      depender del estilo por defecto del navegador.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const pagina = fs.readFileSync(
  path.join(repo, 'src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx'),
  'utf8'
)
const css = fs.readFileSync(path.join(repo, 'src', 'pages', 'Presupuestos', 'Presupuestos.css'), 'utf8')

const opciones = pagina.match(/<button type="button" className="asignar-opcion"/g) || []

test('las seis opciones de la hoja son botones, no divs con onClick', () => {
  assert.equal(opciones.length, 6, `se esperan 6 opciones como botón, hay ${opciones.length}`)
  assert.doesNotMatch(pagina, /<div className="asignar-opcion"/,
    'quedó alguna opción como div: con el teclado no se llega')
})

test('el botón de una opción se alcanza y se activa sin handlers propios', () => {
  // Un <button> real ya trae Tab/Enter/Espacio: si alguien le agrega un onKeyDown
  // manual es señal de que volvió a ser un div disfrazado.
  const idx = pagina.indexOf('<button type="button" className="asignar-opcion"')
  const bloque = pagina.slice(idx, idx + 240)
  assert.doesNotMatch(bloque, /onKeyDown/, 'un botón real no necesita onKeyDown')
})

test('la fila del sobre ya no anida un botón dentro de un role=button', () => {
  const idx = pagina.indexOf('className="sobre-fila"')
  const bloque = pagina.slice(idx, idx + 700)
  assert.doesNotMatch(bloque, /role="button"/, 'la fila no puede volver a ser role="button"')
  assert.doesNotMatch(bloque, /tabIndex=\{0\}/, 'la fila no puede volver a ser un destino de foco')
})

test('el detalle sigue alcanzable con el teclado por el nombre del sobre', () => {
  // Ojo: className="sobre-nombre" también existe en el panel de detalle (línea 921),
  // así que el ancla es el botón completo, no el primer indexOf de la clase.
  const m = pagina.match(/<button\s+type="button"\s+className="sobre-nombre"([\s\S]{0,200})/)
  assert.ok(m, 'el nombre tiene que ser un botón para abrir el detalle con el teclado')
  const bloque = m[1]
  assert.match(bloque, /stopPropagation/, 'el click del nombre no debe disparar además el de la fila')
  assert.match(bloque, /onVerDetalle/, 'el nombre abre el detalle')
})

test('los botones nuevos tienen reset de estilo', () => {
  assert.match(css, /button\.asignar-opcion\s*\{/, 'falta el reset de la opción')
  assert.match(css, /button\.sobre-nombre\s*\{/, 'falta el reset del nombre')
  const reset = css.slice(css.indexOf('button.asignar-opcion {'))
  assert.match(reset.slice(0, 300), /appearance: none/, 'sin appearance el navegador impone su estilo')
  assert.match(css, /focus-visible/, 'falta un foco visible para quien navega con teclado')
})
