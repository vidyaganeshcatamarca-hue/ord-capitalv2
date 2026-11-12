// tests/presupuestos/total-grupo-libertad.test.js
//
//   node --test tests/presupuestos/total-grupo-libertad.test.js
//
// S11 (odd/tasks/bugs-ronda-10-presupuesto.md), literal del dueño: "Cuando le asigno un
// valor a una categoría padre, pero después le asigno cero, quitándole la asignación, me
// genera mal el total. [...] sus hijos tienen 105.500 asignados y él no tiene nada
// asignado, pero en total del grupo me parecen menos 4.000."
//
// La cabecera del padre mostraba `monto_asignado − monto_gastado` de SU PROPIA fila: con
// el padre en cero y el grupo habiendo gastado 4.000 daba −4.000, y la plata de los hijos
// no entraba nunca en la cuenta. Ahora la base es la plata del grupo.
//
// Caso real medido (user 198, ciclo actual): padre 4265 cat_food_home con plata 0, hijos
// 4266 3.500 · 4267 50.000 · 4268 50.000 · 4269 2.000 = 105.500. Gastado del grupo 4.000.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf-8')

const bloqueFila = (() => {
  const i = pagina.indexOf('function FilaSobre(')
  const fin = pagina.indexOf('function GrupoAcordeon(', i)
  return pagina.slice(i, fin > -1 ? fin : i + 8000)
})()

test('el total del grupo del padre usa la plata del grupo en libertad', () => {
  assert.ok(
    bloqueFila.includes("modoPresupuesto === 'anticipado' && sobre.es_padre && plataGrupo !== undefined"),
    'falta la rama que usa la plata del grupo cuando el padre no tiene la plata',
  )
  assert.ok(
    bloqueFila.includes('plataGrupo - Number(sobre.monto_gastado ?? 0)'),
    'el total del grupo tiene que ser plata del grupo menos gastado',
  )
})

test('la prop existe y la cabecera la recibe con el total del grupo', () => {
  assert.ok(pagina.includes('plataGrupo?: number'), 'falta la prop plataGrupo')
  assert.ok(
    pagina.includes('plataGrupo={cabecera.es_padre ? totalAsignado : undefined}'),
    'la cabecera del padre tiene que recibir el totalAsignado del grupo',
  )
})

test('sin plata de grupo, o en base cero, se sigue usando el helper de siempre', () => {
  assert.ok(
    bloqueFila.includes('return disponibleDeSobre(sobre, modoPresupuesto)'),
    'el camino anterior no puede desaparecer: base cero y las hijas siguen por ahí',
  )
})
