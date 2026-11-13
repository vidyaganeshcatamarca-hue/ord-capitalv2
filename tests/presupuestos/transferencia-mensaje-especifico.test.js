// El rechazo de una transferencia tiene que explicarse con la clave del servidor.
// Medido en ego el 2026-11-13: intentar cubrir el déficit de Panadería tomando 2.000 de
// Health devolvía error_budget_parent_below_children y la pantalla decía sólo
// «Error transferring between envelopes», aunque la traducción existía en los tres
// diccionarios y la página ya la resolvía para las asignaciones.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pagina = readFileSync(
  new URL('../../src/pages/Presupuestos/PresupuestosPage.tsx', import.meta.url),
  'utf8',
)

// El envío de la transferencia va desde la llamada al RPC hasta que se libera el candado.
const desde = pagina.indexOf("supabase.rpc('fn_transferir_entre_sobres'")
const hasta = pagina.indexOf('setLoadingTransferir(false)')
assert.notEqual(desde, -1, 'no encontré la llamada a fn_transferir_entre_sobres')
assert.notEqual(hasta, -1, 'no encontré el cierre del envío de la transferencia')
const envio = pagina.slice(desde, hasta)

test('el rechazo de la transferencia usa el mensaje del servidor', () => {
  assert.match(envio, /mensajeRechazoPresupuesto\(err, t, formatMonto\)/,
    'el catch tiene que resolver la clave del servidor antes de caer al genérico')
})

test('el mensaje del servidor manda sobre el genérico', () => {
  const especifico = envio.indexOf('mensajeRechazoPresupuesto(err, t, formatMonto)')
  const generico = envio.indexOf("t('budget_error_transfer')")
  assert.ok(especifico !== -1 && generico !== -1, 'faltan las dos ramas')
  assert.ok(especifico < generico, 'el genérico no puede evaluarse antes que el específico')
})

test('el genérico sigue existiendo como última red', () => {
  // Si se saca, cualquier error nuevo (red, permisos) se queda sin aviso.
  assert.match(envio, /t\('budget_error_transfer'\)/)
  assert.match(envio, /error_insufficient_funds_in_envelope/)
})

test('la transferencia avisa cuando se hace', () => {
  // Medido en ego: la transferencia cerraba el modal sin decir nada. El camino del
  // sobre virtual avisaba y la asignación con dinero movido también; éste no.
  assert.match(envio, /t\('budget_move_done', \{ monto: formatMonto\(monto\) \}\)/,
    'la rama exitosa tiene que avisar con la clave de dinero movido')
})
