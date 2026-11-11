// tests/presupuestos/barra-hijo-sin-asignacion.test.js
//
//   node --test tests/presupuestos/barra-hijo-sin-asignacion.test.js
//
// Dueño (2026-11-11): "comparemos el gasto del hijo que no tiene asignación contra la
// asignación del padre. Si la tiene. Entonces ahí sí podemos dibujar la barra." Y al
// elegir denominador: "barra, vamos por 1" = el libre del padre, el mismo denominador
// para todos los hijos sin asignación, sin repartirlo en partes iguales.
//
// Antes: un hijo con asignación 0 y gasto > 0 daba `getPctBarra` = 100, o sea barra
// llena y roja contra un techo que no existía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  referenciaBarraHija,
  porcentajeBarra,
  colorDeBarra,
} from '../../src/lib/barraSobre.ts'

test('un hijo con asignación propia se mide contra la suya', () => {
  const referencia = referenciaBarraHija({ montoAsignado: 50_000, libreGrupo: 30_000 })
  assert.equal(referencia.origen, 'propia')
  assert.equal(referencia.techo, 50_000)
})

test('un hijo sin asignación se mide contra el libre del padre', () => {
  const referencia = referenciaBarraHija({ montoAsignado: 0, libreGrupo: 30_000 })
  assert.equal(referencia.origen, 'libre_padre')
  assert.equal(referencia.techo, 30_000)
})

test('sin asignación propia y sin libre en el padre no hay techo ni barra', () => {
  const referencia = referenciaBarraHija({ montoAsignado: 0, libreGrupo: 0 })
  assert.equal(referencia.origen, 'sin_techo')
  assert.equal(referencia.techo, 0)
  assert.equal(porcentajeBarra(161_500, referencia.techo), null)
  assert.equal(colorDeBarra(161_500, referencia.techo), null)
})

test('el denominador es el mismo para todos los hijos sin asignación: el libre no se reparte', () => {
  // Tres hijos sin asignación sobre un libre de 30.000. Si se repartiera en partes
  // iguales cada uno tendría 10.000; con denominador único los tres se miden igual.
  const libreGrupo = 30_000
  const techos = [0, 0, 0].map(() => referenciaBarraHija({ montoAsignado: 0, libreGrupo }).techo)
  assert.deepEqual(techos, [30_000, 30_000, 30_000])

  // Cada barra informa cuánto del libre se comió ese hijo.
  assert.equal(porcentajeBarra(18_000, 30_000), 60)
})

test('porcentajeBarra no devuelve 100 cuando no hay techo', () => {
  // Este era el defecto: getPctBarra(gastado, 0) daba 100 y pintaba la barra llena.
  assert.equal(porcentajeBarra(161_500, 0), null)
  assert.equal(porcentajeBarra(0, 0), null)
  assert.equal(porcentajeBarra(161_500, -5), null)
})

test('porcentajeBarra mide contra el techo y no pasa de 100', () => {
  assert.equal(porcentajeBarra(0, 50_000), 0)
  assert.equal(porcentajeBarra(25_000, 50_000), 50)
  assert.equal(porcentajeBarra(50_000, 50_000), 100)
  assert.equal(porcentajeBarra(90_000, 50_000), 100)
})

test('colorDeBarra corta en el mismo umbral que el servidor', () => {
  assert.equal(colorDeBarra(35_000, 50_000), 'verde') // 70% justo: todavía verde
  assert.equal(colorDeBarra(35_001, 50_000), 'amarillo')
  assert.equal(colorDeBarra(50_000, 50_000), 'amarillo')
  assert.equal(colorDeBarra(50_001, 50_000), 'rojo')
  assert.equal(colorDeBarra(0, 0), null)
})

test('los montos vacíos no rompen la referencia', () => {
  assert.equal(referenciaBarraHija({ montoAsignado: null, libreGrupo: null }).origen, 'sin_techo')
  assert.equal(referenciaBarraHija({ montoAsignado: undefined, libreGrupo: 1_000 }).origen, 'libre_padre')
})

test('la página cablea el helper en las filas hijas y no dibuja barra sin techo', () => {
  // Las reglas de arriba podrían quedar perfectas y desconectadas: esto ata el
  // contrato a la página real.
  const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf8')

  assert.match(pagina, /from '\.\.\/\.\.\/lib\/barraSobre'/, 'la página tiene que importar el helper')
  assert.match(pagina, /referenciaBarraHija\(\{ montoAsignado: sobre\.monto_asignado, libreGrupo \}\)/)
  assert.match(pagina, /!sinDatos && !sinTecho/, 'sin techo no se dibuja la barra')
  assert.match(pagina, /sinTecho \? '—'/, 'sin techo el avance no es un porcentaje inventado')

  // El libre del grupo tiene que llegar también a las filas hijas: antes solo lo
  // recibía la cabecera y el hijo no tenía contra qué medirse.
  const pasesDelLibre = pagina.match(/libreGrupo=\{libreDe\(cabecera\.estructura_id\)\}/g) ?? []
  assert.equal(pasesDelLibre.length, 1, 'el hijo recibe el libre del grupo')
  const paseCondicional = /libreGrupo=\{cabecera\.es_padre \? libreDe\(cabecera\.estructura_id\) : undefined\}/
  assert.match(pagina, paseCondicional, 'la cabecera sigue recibiendo el libre como antes')
})
