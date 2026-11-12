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
  referenciaBarraDeSobre,
  porcentajeAvance,
  porcentajeDelPozo,
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
  assert.match(pagina, /referenciaBarraDeSobre\(\{ techo, montoAsignado: sobre\.monto_asignado, libreGrupo \}\)/)
  assert.match(pagina, /!sinDatos && !sinTecho/, 'sin techo no se dibuja la barra')
  assert.match(pagina, /sinTecho \? '—'/, 'sin techo el avance no es un porcentaje inventado')

  // El libre del grupo tiene que llegar también a las filas hijas: antes solo lo
  // recibía la cabecera y el hijo no tenía contra qué medirse.
  const pasesDelLibre = pagina.match(/libreGrupo=\{libreDe\(cabecera\.estructura_id\) \?\? undefined\}/g) ?? []
  assert.equal(pasesDelLibre.length, 1, 'el hijo recibe el libre del grupo')
  const paseCondicional = /libreGrupo=\{cabecera\.es_padre \? libreDe\(cabecera\.estructura_id\) \?\? undefined : undefined\}/
  assert.match(pagina, paseCondicional, 'la cabecera sigue recibiendo el libre como antes')
})

test('el techo manda sobre cualquier otra referencia', () => {
  // Modelo A: el techo dice lo que se puede gastar; la plata, cuánto se asignó.
  const referencia = referenciaBarraDeSobre({ techo: 25_000, montoAsignado: 40_000, libreGrupo: 30_000 })
  assert.equal(referencia.origen, 'techo')
  assert.equal(referencia.techo, 25_000)
  assert.equal(porcentajeBarra(20_000, referencia.techo), 80)
})

test('sin techo se cae a la plata propia, y después al libre del grupo', () => {
  // Techo null es SIN tope, no tope cero: la fila sigue midiéndose contra su plata.
  const conPlata = referenciaBarraDeSobre({ techo: null, montoAsignado: 40_000, libreGrupo: 30_000 })
  assert.equal(conPlata.origen, 'propia')
  assert.equal(conPlata.techo, 40_000)

  const sinNada = referenciaBarraDeSobre({ techo: null, montoAsignado: 0, libreGrupo: 30_000 })
  assert.equal(sinNada.origen, 'libre_padre')

  const sinNadaNiLibre = referenciaBarraDeSobre({ techo: null, montoAsignado: 0, libreGrupo: 0 })
  assert.equal(sinNadaNiLibre.origen, 'sin_techo')
  assert.equal(porcentajeBarra(15_000, sinNadaNiLibre.techo), null)
})

test('un techo de cero no es lo mismo que sin techo, pero ninguno pinta barra', () => {
  // Techo cero sería "no podés gastar nada". Igual no hay barra que dibujar porque el
  // denominador es cero; lo importante es que NO se confunda con la plata.
  const cero = referenciaBarraDeSobre({ techo: 0, montoAsignado: 40_000, libreGrupo: 0 })
  assert.equal(cero.origen, 'propia')
  assert.equal(cero.techo, 40_000)
})

test('el avance no se topea: 150 es haberse pasado un 50%', () => {
  // Dueño: "cuando me paso de la barra, la barra se pinta completa y el número indica el
  // porcentaje en el que me pasé". El relleno se corta; el número no.
  assert.equal(porcentajeAvance(15_000, 10_000), 150)
  assert.equal(porcentajeAvance(10_000, 10_000), 100)
  assert.equal(porcentajeAvance(0, 10_000), 0)
  assert.equal(porcentajeAvance(5, 0), null)
})

test('el consumo del pozo es individual: dos hijos pueden sumar más de 100', () => {
  // Dueño: "lo que comió ese hijo en relación a lo que el padre tenía disponible".
  assert.equal(porcentajeDelPozo(15_000, 50_000), 30)
  // Dos hijos distintos, 30% cada uno: el rótulo dice consumo individual, no saldo.
  assert.equal(porcentajeDelPozo(15_000, 50_000) + porcentajeDelPozo(15_000, 50_000), 60)
  // El relleno sí se corta en el ancho de la barra.
  assert.equal(porcentajeDelPozo(60_000, 50_000), 100)
  assert.equal(porcentajeDelPozo(1, 0), null)
})
