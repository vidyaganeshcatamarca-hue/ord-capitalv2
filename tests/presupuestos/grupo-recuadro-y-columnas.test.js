// tests/presupuestos/grupo-recuadro-y-columnas.test.js
//
//   node --test tests/presupuestos/grupo-recuadro-y-columnas.test.js
//
// Ronda 8 (dueño, verbatim):
//   "Para toda la categoría padre, incluida sus hijos, cuando se despliegan, un borde
//    verde grueso, tal cual el menú ajustes, y luego cada una de las subcategorías en un
//    borde personal fino. Para que se pueda leer donde empieza y termina cada tarjeta de
//    las subcategorías, y que todas pertenecen al mismo rubro padre."
//   "total del grupo como título alineado a la derecha abajo de asignar con buena
//    distancia y el valor abajo centrado justo abajo del total del grupo [...] Grupal
//    libre lo debes sacar [...] Asignado, gasto y libre son títulos y luego el valor
//    debería estar abajo, centrado [...] separarlos con algún separador vertical"
//   "Una categoría, una vez que se le asigna un presupuesto, vuelve el scroll arriba,
//    debería dejarlo donde está, porque puedo querer continuar con la categoría de abajo."
//
// Lo que se congela:
//   1. El bloque del grupo envuelve al padre y a sus hijas, y existe sólo si hay hijas.
//   2. El bloque abierto lleva el recuadro verde grueso; cada hija, el fino.
//   3. El total del grupo es un título a la derecha con el monto debajo.
//   4. Los datos son columnas (título arriba, monto abajo) separadas por una línea.
//   5. Guardar una asignación recarga sin desmontar la lista: el scroll no se mueve.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')

const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')

const CUPO = pagina.slice(pagina.indexOf('function GrupoAcordeon'), pagina.indexOf('function FilaSobre({'))
const FILA = pagina.slice(pagina.indexOf('function FilaSobre({'), pagina.indexOf('function InfoBubble'))

test('el grupo padre y sus hijas viajan en un mismo bloque', () => {
  assert.ok(CUPO.includes('const bloques: Array<{ cabecera: SobreDetalle; hijas: SobreDetalle[] }> = []'),
    'la lista plana no deja dibujar un recuadro que envuelva padre e hijas')
  assert.ok(CUPO.includes('className="sobre-grupo-bloque abierto"'),
    'falta el envoltorio del grupo desplegado')
  assert.ok(CUPO.includes('className="sobre-grupo-hija"'),
    'cada subcategoría necesita su propia tarjeta')
  // Un rubro con presupuesto pero sin hijas no es un grupo: no puede quedar envuelto.
  assert.ok(CUPO.includes('if (hijas.length === 0)'),
    'sin hijas el bloque no existe: la fila queda suelta, como cualquier otra')
})

test('el grupo desplegado lleva recuadro grueso y cada hija uno fino', () => {
  const iGrupo = css.indexOf('.sobre-grupo-bloque.abierto {')
  assert.ok(iGrupo > -1, 'falta el recuadro del grupo desplegado')
  const grupo = css.slice(iGrupo, iGrupo + 300)
  assert.ok(grupo.includes('border: 2px solid var(--mint)'),
    'el grupo tiene que usar el mismo borde grueso que el menú de Ajustes')

  const iHija = css.indexOf('.sobre-grupo-hija {')
  assert.ok(iHija > -1, 'falta la tarjeta de la subcategoría')
  const hija = css.slice(iHija, iHija + 300)
  assert.ok(hija.includes('border: 1px solid var(--mint)'),
    'la subcategoría lleva un borde fino del mismo verde')

  // Plegado sin recuadro: el criterio que el dueño aprobó en Ajustes.
  assert.ok(!/\.sobre-grupo-bloque\s*\{[^}]*border:[^;}]*solid/.test(css),
    'el envoltorio no puede llevar borde propio: el recuadro es sólo del estado abierto')
  // La línea divisoria interna la reemplaza el recuadro.
  assert.ok(css.includes('.sobre-grupo-bloque.abierto > .sobre-fila {'),
    'la cabecera del grupo no lleva su raya interna: el recuadro ya la delimita')
})

test('total del grupo: título a la derecha y monto centrado debajo', () => {
  assert.ok(FILA.includes('className="sobre-grupo-total"'), 'falta el bloque del total')
  assert.ok(FILA.includes('sobre-grupo-total-titulo'), 'falta el título')
  assert.ok(FILA.includes('sobre-grupo-total-valor'), 'falta el monto debajo del título')
  assert.ok(FILA.includes('sobre.es_padre ? ('),
    'el bloque es sólo del rubro padre: en una hoja suelta el monto va en la misma línea')

  const iTotal = css.indexOf('.sobre-grupo-total {')
  const total = css.slice(iTotal, iTotal + 400)
  assert.ok(total.includes('margin-left: auto'), 'el bloque se pega al borde derecho')
  assert.ok(total.includes('align-items: center'), 'el monto se centra respecto del título')
  assert.ok(total.includes('padding-top'), 'el título arranca debajo del botón Asignar, no encima')

  const iTitulo = css.indexOf('.sobre-grupo-total-titulo {')
  assert.ok(css.slice(iTitulo, iTitulo + 300).includes('align-self: flex-end'),
    'el título es lo único que va alineado a la derecha')
})

test('los datos del sobre son columnas con separador vertical', () => {
  assert.ok(FILA.includes('sobre-stats--columnas'), 'los datos tienen que ser columnas')
  assert.ok(FILA.includes("sobre.es_padre ? ' sobre-stats--padre' : ''"),
    'el separador vertical es de los rubros padre')

  const iCol = css.indexOf('.sobre-stats--columnas .sobre-stat {')
  assert.ok(iCol > -1, 'falta el estilo de la columna')
  const col = css.slice(iCol, iCol + 400)
  assert.ok(col.includes('flex-direction: column'), 'el título va arriba y el monto abajo')
  assert.ok(col.includes('align-items: center'), 'el monto va centrado bajo su título')

  const iSep = css.indexOf('.sobre-stats--padre .sobre-stat + .sobre-stat {')
  assert.ok(iSep > -1, 'falta el separador vertical entre columnas')
  // S8 (dueño): «refuerces las líneas separatorias [...] Hazla más evidente, más fuerte».
  // Cambio de contrato deliberado: era 1px con --border, ahora 2px con --border-light.
  const sep = css.slice(iSep, iSep + 200)
  assert.ok(sep.includes('border-left: 2px solid var(--border-light)'),
    'el separador reforzado usa el token del tema, no un color fijo')
  assert.ok(!sep.includes('rgba(') && !sep.includes('#'),
    'nada de colores fijos: el tema tiene versión clara y oscura')
})

test('los rótulos de los datos son títulos, sin dos puntos', () => {
  // S8 (dueño): «¿Qué etiqueta le podemos poner a libre...?» — eligió «Sin asignar».
  // Cambio de contrato deliberado: la etiqueta era «Libre» en los tres idiomas.
  for (const [archivo, valores] of [
    ['es.ts', ['Asignado', 'Gastado', 'Sin asignar', 'Avance']],
    ['en.ts', ['Assigned', 'Spent', 'Unassigned', 'Progress']],
    ['pt.ts', ['Atribuído', 'Gasto', 'Não atribuído', 'Avanço']],
  ]) {
    const dic = leer('src', 'locales', archivo)
    for (const clave of ['budget_stat_assigned', 'budget_stat_spent', 'budget_stat_group_free', 'budget_stat_progress']) {
      const m = dic.match(new RegExp(`${clave}:\\s*"([^"]*)"`))
      assert.ok(m, `falta ${clave} en ${archivo}`)
      assert.ok(!m[1].endsWith(':'), `${clave} de ${archivo} ya no es una etiqueta en línea: no lleva dos puntos`)
      assert.ok(valores.includes(m[1]), `${clave} de ${archivo} tiene que ser uno de ${valores.join(', ')}`)
    }
  }
})

test('asignar un presupuesto recarga sin desmontar la lista', () => {
  const iCarga = pagina.indexOf('const cargarDatos = useCallback(async')
  assert.ok(iCarga > -1, 'falta cargarDatos')
  const carga = pagina.slice(iCarga, iCarga + 400)
  assert.ok(carga.includes('silencioso: boolean = false'), 'la recarga necesita su modo silencioso')
  assert.ok(carga.includes('if (!silencioso) setLoading(true)'),
    'la recarga silenciosa no puede prender el spinner: desmonta la lista y el scroll vuelve a cero')

  const iAsignar = pagina.indexOf('const ejecutarAsignacion = async')
  const asignar = pagina.slice(iAsignar, iAsignar + 2500)
  assert.ok(asignar.includes('await cargarDatos(true)'),
    'después de guardar, la recarga tiene que ser silenciosa')

  // El spinner sigue existiendo para la primera carga y para el cambio de ciclo.
  assert.ok(pagina.includes('cargarDatos()\n'), 'el montaje y el cambio de mes conservan el spinner')
})
