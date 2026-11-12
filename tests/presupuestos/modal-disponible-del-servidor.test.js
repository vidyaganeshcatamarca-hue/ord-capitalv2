// tests/presupuestos/modal-disponible-del-servidor.test.js
//
//   node --test tests/presupuestos/modal-disponible-del-servidor.test.js
//
// Dueño (2026-11-11): "Alimentos Hogar me muestra 29.244, cuando en realidad tiene 500,
// nada más. [...] no los tiene, solamente me permite 500, pero me está mostrando mal el
// valor". Eligió unificar en el servidor: la pantalla deja de calcular el disponible.
//
// El número bueno lo da `fn_disponibles_transferibles`. La pantalla tiene que:
//   1. llamar a esa RPC con el período que está mirando,
//   2. preferir el valor del servidor sobre cualquier cálculo propio,
//   3. mostrar ese mismo valor en el modal de transferencia.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf8')

test('la página pide los disponibles al servidor con el período que mira', () => {
  assert.match(
    pagina,
    /supabase\.rpc\('fn_disponibles_transferibles', \{ p_mes: mesPeriodoStr \}\)/,
    'falta la llamada a fn_disponibles_transferibles con p_mes'
  )
})

test('un fallo de esa RPC no rompe la pantalla', () => {
  // Va aislada como el termómetro de cupos: si falla, la pantalla sigue con el cálculo
  // viejo en lugar de quedarse en blanco.
  const bloque = pagina.slice(pagina.indexOf("supabase.rpc('fn_disponibles_transferibles'"))
  assert.match(bloque.slice(0, 400), /catch\s*\{/, 'la llamada tiene que estar dentro de un try/catch')
})

test('el disponible para transferir prefiere el valor del servidor', () => {
  const inicio = pagina.indexOf('const disponibleParaTransferir')
  assert.notEqual(inicio, -1, 'no encuentro disponibleParaTransferir')
  const cuerpo = pagina.slice(inicio, inicio + 600)
  assert.match(cuerpo, /disponiblesTransferibles\?\.\[Number\(s\.estructura_id\)\]/, 'no consulta el mapa del servidor')
  assert.match(cuerpo, /if \(delServidor !== undefined\) return delServidor/, 'no devuelve el valor del servidor primero')
})

test('el monto que se muestra en el modal es el del servidor, también en el padre', () => {
  // Antes el padre se pisaba con fondoLibreDe (techo menos hijos), que es lo que producía
  // el 29.454. Ahora todas las filas usan el disponible del servidor.
  assert.match(pagina, /\.map\(s => \(\{ \.\.\.s, monto_disponible: disponibleParaTransferir\(s\) \}\)\)/)
  assert.doesNotMatch(
    pagina,
    /\.map\(s => \(s\.es_padre \? \{ \.\.\.s, monto_disponible: fondoLibreDe\(s\.estructura_id\) \} : s\)\)/,
    'quedó el pisado viejo con fondoLibreDe en la lista de orígenes'
  )
})
