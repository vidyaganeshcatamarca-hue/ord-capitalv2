// tests/presupuestos/techo-editable-y-historial.test.js
//
//   node --test tests/presupuestos/techo-editable-y-historial.test.js
//
// Etapa 3, dos piezas que se atan acá contra el código fuente de la pantalla:
//
//   1. El techo de una subcategoría se edita tocándolo. El control existe SÓLO en una
//      subcategoría (el rubro padre no tiene techo: su referencia es la plata que tiene
//      asignada) y SÓLO en el ciclo activo (`soloLectura` apaga cualquier edición de un
//      ciclo cerrado). El techo es opcional: hay un camino explícito que manda `null`
//      para dejar la fila sin tope.
//   2. El rastro es visible. La hoja de detalle llama a `fn_historial_presupuesto` con
//      los nombres exactos de parámetro del servidor, lista como máximo las últimas 10
//      entradas y, cuando no hay historia, lo dice en una línea en vez de dibujar un
//      recuadro vacío. En un ciclo pasado se lee igual: la historia no se apaga.
//
// Las dos RPC ya están desplegadas y verificadas del lado del servidor. Lo que este
// archivo congela es el contrato del cliente: nombres de RPC y de parámetros, gates y
// textos. Ninguna de estas aserciones necesita render: leen el fuente, como el resto de
// tests/presupuestos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

// El checkout de Windows trae CRLF; los cortes de bloque buscan '\n'.
const leer = (...partes) =>
  fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')

const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')
const diccionario = (lang) => leer('src', 'locales', `${lang}.ts`)

/** Recorta un bloque por su texto de apertura hasta la primera llave de cierre. */
const bloque = (desdeTexto, cierre = '\n}\n') => {
  const desde = pagina.indexOf(desdeTexto)
  assert.ok(desde > -1, `no encontré ${desdeTexto}`)
  const fin = pagina.indexOf(cierre, desde)
  assert.ok(fin > desde, `no encontré el cierre de ${desdeTexto}`)
  return pagina.slice(desde, fin)
}

// ─── 1. El techo se edita en la fila ─────────────────────────────────────────

test('el control del techo existe sólo en una subcategoría', () => {
  const fila = bloque('function FilaSobre(')
  assert.match(
    fila,
    /const esSubcategoria = esSubcategoriaDeRubro\(sobre\)/,
    'la subcategoría se deriva de los datos que la fila ya tiene',
  )
  assert.match(
    fila,
    /const puedeEditarTecho = esSubcategoria && !soloLectura && !!onEditarTecho/,
    'el gate es exactamente: subcategoría, ciclo activo y control cableado',
  )
  assert.match(
    fila,
    /\{puedeEditarTecho \? \(\s*<button[\s\S]*?className="sobre-stat-val sobre-stat-val--editable"/,
    'el botón vive dentro del gate: sin gate vuelve a ser un número pelado',
  )
  // Un solo control por fila: el valor del techo no se duplica en el nombre ni afuera.
  assert.equal(
    (fila.match(/sobre-stat-val--editable/g) ?? []).length,
    1,
    'un solo control editable por fila',
  )
})

test('un ciclo cerrado no ofrece editar el techo', () => {
  const fila = bloque('function FilaSobre(')
  assert.match(fila, /puedeEditarTecho = esSubcategoria && !soloLectura/, 'la fila se apaga en solo lectura')

  // La guarda de fondo: aunque el control se escape, abrir y guardar se cortan igual.
  const abrir = bloque('const handleAbrirTecho =', '\n  }\n')
  assert.match(abrir, /if \(soloLectura\) \{/, 'abrir el editor en un ciclo cerrado no hace nada')
  assert.match(
    abrir,
    /showToast\(t\('budget_readonly_cycle_toast'\), 'error'\)/,
    'avisa con el mismo texto que el resto de la pantalla cerrada',
  )

  const guardar = bloque('const handleGuardarTecho = async', '\n  }\n')
  assert.match(guardar, /if \(soloLectura\) \{/, 'guardar en un ciclo cerrado no escribe')
  const guardaSoloLectura = guardar.indexOf('if (soloLectura) {')
  const llamadaRpc = guardar.indexOf("supabase.rpc('fn_asignar_techo'")
  assert.ok(
    guardaSoloLectura > -1 && llamadaRpc > guardaSoloLectura,
    'la guarda corta antes de llamar al servidor',
  )
})

test('el rubro padre no ofrece el control: su referencia es la plata', () => {
  const fila = bloque('function FilaSobre(')
  // La rama del padre de la franja de datos se queda con «Asignado» y nada más.
  const franja = fila.indexOf('sobre-stats sobre-stats--columnas')
  assert.ok(franja > -1, 'no encontré la franja de datos')
  const inicioPadre = fila.indexOf('{sobre.es_padre ? (', franja)
  const finPadre = fila.indexOf(') : (', inicioPadre)
  assert.ok(inicioPadre > -1 && finPadre > inicioPadre, 'no encontré la rama del padre')
  const ramaPadre = fila.slice(inicioPadre, finPadre)
  assert.ok(
    !ramaPadre.includes('editable'),
    'la rama del padre no puede tener el control del techo',
  )
  assert.match(ramaPadre, /budget_stat_assigned/, 'el padre sigue mostrando la plata asignada')

  // Y si la hoja se abre igual sobre un padre, el servidor ya lo rechaza: el aviso es
  // el texto traducido, no la key cruda.
  const abrir = bloque('const handleAbrirTecho =', '\n  }\n')
  assert.match(abrir, /esSubcategoriaDeRubro\(sobre\)/, 'la guarda está en el cliente')
  assert.match(
    abrir,
    /showToast\(t\('error_ceiling_only_for_subcategory'\), 'error'\)/,
    'el rechazo se explica con texto traducido',
  )
})

// ─── 2. El servidor, con los nombres exactos ─────────────────────────────────

test('el techo se guarda con fn_asignar_techo y sus parámetros reales', () => {
  const guardar = bloque('const handleGuardarTecho = async', '\n  }\n')
  assert.match(
    guardar,
    /supabase\.rpc\('fn_asignar_techo', \{[\s\S]*?p_estructura_egreso_id:[\s\S]*?p_techo:[\s\S]*?p_mes_periodo:/,
    'la RPC y los tres nombres de parámetro tienen que ser los del servidor',
  )
})

test('el historial se lee con fn_historial_presupuesto y sus parámetros reales', () => {
  assert.match(
    pagina,
    /supabase\.rpc\('fn_historial_presupuesto', \{[\s\S]*?p_estructura_egreso_id:[\s\S]*?p_mes_periodo:/,
    'la lectura del rastro va por la RPC, nunca por una tabla',
  )
  // No hay lectura directa de tablas desde el cliente (regla 0).
  assert.ok(
    !/from\('p_presupuestos_historial'\)/.test(pagina),
    'el historial no se lee de la tabla',
  )
})

test('quitar el techo manda null: la fila queda sin tope', () => {
  // El camino explícito en la hoja.
  assert.match(
    pagina,
    /onClick=\{\(\) => void handleGuardarTecho\(null\)\}/,
    'falta la acción «quitar techo»',
  )
  assert.match(pagina, /t\('budget_ceiling_remove'\)/, 'la acción tiene texto propio')
  // Y el null llega al servidor tal cual: es el caso «vacío», no un cero.
  const guardar = bloque('const handleGuardarTecho = async', '\n  }\n')
  assert.match(guardar, /p_techo: techo/, 'el valor del input viaja sin inventar un 0')
  assert.match(guardar, /techo === null/, 'el null se distingue del número en el mensaje')
  // Un cero o un negativo no se mandan: el servidor los rechaza y el cliente avisa antes.
  const input = bloque('const guardarTechoDelInput =', '\n  }\n')
  assert.match(input, /techo <= 0/, 'cero no es un techo: es «sin tope», y va por el null')
})

// ─── 3. El rastro visible ────────────────────────────────────────────────────

test('la hoja de detalle tiene el bloque del historial', () => {
  const hoja = bloque('showDetalleSheet && sobreSeleccionado', '\n      )}')
  assert.match(hoja, /<div className="presupuesto-historial">/, 'falta el bloque del rastro')
  assert.match(hoja, /t\('budget_history_title'\)/, 'el bloque lleva su título')
})

test('el historial lista como máximo las últimas 10 entradas', () => {
  assert.match(
    pagina,
    /const HISTORIAL_VISIBLE = 10\n/,
    'el tope es una constante con nombre, no un número suelto',
  )
  const recortes = pagina.match(/slice\(0, HISTORIAL_VISIBLE\)/g) ?? []
  assert.ok(recortes.length >= 1, 'el tope se aplica de verdad')
  assert.match(
    pagina,
    /\{historial\.slice\(0, HISTORIAL_VISIBLE\)\.map\(/,
    'el render corta en el tope',
  )
})

test('sin historia se dice en una línea, no se dibuja un recuadro vacío', () => {
  assert.match(
    pagina,
    /!historial \|\| historial\.length === 0 \?[\s\S]{0,200}?t\('budget_history_empty'\)/,
    'el caso vacío tiene su propia línea',
  )
  assert.match(pagina, /t\('budget_history_loading'\)/, 'mientras carga también se dice algo')
})

test('cada entrada muestra fecha corta, qué cambió y el motivo', () => {
  const hist = bloque('<div className="presupuesto-historial">', '\n      )}')
  assert.match(hist, /formatFechaHistorial\(fila\.creado_at, locale\)/, 'falta la fecha, en forma corta')
  assert.match(hist, /t\('budget_history_money'/, 'falta lo que cambió de plata')
  assert.match(hist, /t\('budget_history_ceiling'/, 'falta lo que cambió de techo')
  assert.match(
    hist,
    /t\(MOTIVO_HISTORIAL_A_CLAVE\[fila\.motivo \?\? ''\] \?\? 'budget_history_reason_other'\)/,
    'el motivo del servidor se traduce y nunca se imprime crudo',
  )
  // La fecha corta vive en un helper, con día y mes, no con año ni hora.
  const helper = bloque('const formatFechaHistorial =', '\n}\n')
  assert.match(helper, /day: '2-digit', month: 'short'/, 'en 390 px la fecha larga no entra')
})

test('en un ciclo pasado el historial se sigue leyendo', () => {
  const hist = bloque('<div className="presupuesto-historial">', '\n      )}')
  assert.ok(
    !hist.includes('soloLectura'),
    'la historia no se apaga: en un ciclo cerrado sólo se apaga la edición',
  )
})

// ─── 4. La pantalla en 390 px ────────────────────────────────────────────────

test('el bloque nuevo tiene estilos propios, sin inventar un lenguaje visual', () => {
  for (const clase of [
    '.presupuesto-historial {',
    '.presupuesto-historial-titulo {',
    '.presupuesto-historial-vacio {',
    '.presupuesto-historial-lista {',
    '.presupuesto-historial-item {',
    '.presupuesto-historial-fecha {',
    '.presupuesto-historial-motivo {',
    '.presupuesto-quitar-techo {',
  ]) {
    assert.ok(css.includes(clase), `falta el estilo ${clase}`)
  }
  // Tokens del tema, no colores fijos: la pantalla tiene versión clara y oscura.
  const histCss = css.slice(css.indexOf('.presupuesto-historial {'))
  assert.ok(histCss.includes('var(--bg-2'), 'el fondo sale del tema')
  assert.ok(histCss.includes('var(--text-3'), 'la fecha y el motivo usan el token de texto suave')
  // El botón del techo se ve como el número que era: la fila no cambia de tamaño.
  assert.ok(css.includes('button.sobre-stat-val--editable {'), 'falta el estilo del valor editable')
})

// ─── 5. Los textos en los tres diccionarios ──────────────────────────────────

const CLAVES_NUEVAS = [
  'budget_ceiling_sheet_title',
  'budget_ceiling_sheet_hint',
  'budget_ceiling_edit_hint',
  'budget_ceiling_save',
  'budget_ceiling_remove',
  'budget_ceiling_saved',
  'budget_ceiling_removed',
  'budget_ceiling_error',
  'error_ceiling_must_be_positive',
  'error_ceiling_only_for_subcategory',
  'budget_history_title',
  'budget_history_loading',
  'budget_history_empty',
  'budget_history_money',
  'budget_history_ceiling',
  'budget_history_ceiling_none',
  'budget_history_reason_ceiling',
  'budget_history_reason_manual',
  'budget_history_reason_transfer_out',
  'budget_history_reason_transfer_in',
  'budget_history_reason_to_base_zero',
  'budget_history_reason_to_freedom',
  'budget_history_reason_other',
]

test('las claves nuevas están en los tres diccionarios', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const dic = diccionario(lang)
    for (const clave of CLAVES_NUEVAS) {
      assert.ok(
        dic.includes(`  ${clave}: "`),
        `${lang}.ts no publica ${clave}`,
      )
    }
  }
})

test('los dos rechazos del servidor se traducen en un solo lugar', () => {
  const rechazo = bloque('function mensajeRechazoPresupuesto')
  for (const clave of ['error_ceiling_must_be_positive', 'error_ceiling_only_for_subcategory']) {
    assert.match(rechazo, new RegExp(`parsed\\?\\.key === '${clave}'`), `falta el caso ${clave}`)
    assert.match(rechazo, new RegExp(`return t\\('${clave}'\\)`), `${clave} no se devuelve traducida`)
  }
})

test('la pantalla no hardcodea español para estas piezas (regla 9)', () => {
  const es = diccionario('es')
  const textos = [...es.matchAll(/^  (budget_ceiling_[a-z_]+|budget_history_[a-z_]+|error_ceiling_[a-z_]+): "(.*)",$/gm)]
    .map((m) => m[2])
    .filter((texto) => texto.length > 25)
  assert.ok(textos.length > 0, 'no pude leer los textos españoles')
  for (const texto of textos) {
    assert.ok(!pagina.includes(texto), `el componente pega el texto español: «${texto}»`)
  }
})
