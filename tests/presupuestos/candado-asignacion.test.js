// tests/presupuestos/candado-asignacion.test.js
//
//   node --test tests/presupuestos/candado-asignacion.test.js
//
// Ronda de auditoría, F-07 (bajo, "unverified" en el informe del auditor). El
// informe no pudo demostrar la duplicación porque la hoja se desmonta después del
// primer guardado; el dueño pidió el candado igual: "f-07, pon el candado".
//
// Lo que se congela:
//   1. `ejecutarAsignacion` no arranca si ya hay un guardado en curso.
//   2. El estado se libera SIEMPRE, también cuando el guardado falla: si no, el
//      botón queda trabado después del primer intento y el usuario no puede
//      reintentar. Ese fue el error real que se cometió al escribir el candado.
//   3. El botón de confirmar monto manual se dibuja deshabilitado mientras guarda.

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

const cuerpoDe = (nombre) => {
  const desde = pagina.indexOf(`const ${nombre} = async`)
  assert.ok(desde > -1, `no encontré ${nombre}`)
  const fin = pagina.indexOf('\n  }\n', desde)
  assert.ok(fin > desde, `no encontré el cierre de ${nombre}`)
  return pagina.slice(desde, fin)
}

test('la asignación no arranca si ya hay un guardado en curso', () => {
  const cuerpo = cuerpoDe('ejecutarAsignacion')
  assert.match(cuerpo, /if \(guardandoAsignacion\) return/,
    'falta la guarda de entrada: dos toques seguidos mandarían dos escrituras')
  assert.match(cuerpo, /setGuardandoAsignacion\(true\)/,
    'falta marcar el envío en curso')
})

test('el candado se libera también cuando el guardado falla', () => {
  const cuerpo = cuerpoDe('ejecutarAsignacion')
  assert.match(cuerpo, /\} finally \{/, 'el candado tiene que liberarse en un finally')
  assert.ok(cuerpo.indexOf('setGuardandoAsignacion(false)') > cuerpo.indexOf('} finally {'),
    'la liberación tiene que estar dentro del finally, no en el camino feliz')
})

test('el botón de monto manual queda deshabilitado mientras guarda', () => {
  const idx = pagina.indexOf('className="btn-confirmar-monto"')
  assert.ok(idx > -1, 'no encontré el botón de confirmar monto')
  const bloque = pagina.slice(idx, idx + 400)
  assert.match(bloque, /disabled=\{guardandoAsignacion \|\|/,
    'el botón de confirmar tiene que mirar el estado de guardado')
})
