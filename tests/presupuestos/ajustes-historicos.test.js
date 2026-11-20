// Bloque E · corregir un gasto de un ciclo cerrado deja un ajuste en el ciclo activo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (f) => fs.readFileSync(path.join(repo, 'funcionesSQL', `${f}.md`), 'utf8')
const compacto = (s) => s.replace(/\s+/g, ' ')

// El checkout de Windows trae CRLF; los cortes de bloque buscan '\n'.
const leerSrc = (...partes) =>
  fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')

const pagina = leerSrc('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const css = leerSrc('src', 'pages', 'Presupuestos', 'Presupuestos.css')
const diccionario = (lang) => leerSrc('src', 'locales', `${lang}.ts`)

test('el ajuste se dispara al tocar un movimiento y no crea otro movimiento', () => {
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(/date_trunc\('month', OLD\.fecha\)/.test(cuerpo), 'mira el ciclo de origen')
  assert.ok(/date_trunc\('month', NEW\.fecha\)/.test(cuerpo), 'mira el ciclo de destino')
  assert.ok(/tipo = 'ciclo'/.test(cuerpo), 'solo actua si ese ciclo esta cerrado')
  assert.ok(
    !/INSERT INTO (?:public\.)?p_caja|UPDATE (?:public\.)?p_caja|p_billeteras/.test(cuerpo),
    'el ajuste no puede crear ni mover dinero: es presupuestario',
  )
})

test('el ajuste queda con trazabilidad al movimiento y al ciclo que corrige', () => {
  const cuerpo = compacto(leer('fn_registrar_ajuste_presupuesto'))
  assert.ok(/'ajuste'/.test(cuerpo), 'se guarda como ajuste, no como cierre')
  assert.ok(/'correccion_movimiento'/.test(cuerpo), 'lleva su motivo')
  assert.ok(/ciclo_corregido/.test(cuerpo), 'lleva el ciclo historico que corrige')
  assert.ok(/caja_id/.test(cuerpo), 'lleva el movimiento que lo origino')
  assert.ok(
    /DO UPDATE SET saldo_cierre = public\.p_presupuestos_cierre\.saldo_cierre \+ EXCLUDED\.saldo_cierre/.test(cuerpo),
    'dos correcciones del mismo movimiento acumulan la diferencia real, no dos filas',
  )
})

test('el ajuste cae en el grupo que manda plata, nunca en la subcategoria', () => {
  const grupo = compacto(leer('fn_grupo_de_estructura'))
  assert.ok(/COALESCE\(e\.padre_id, e\.estructura_id\)/.test(grupo), 'devuelve el padre si es subcategoria')
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(
    /fn_grupo_de_estructura\(OLD\.estructura_egreso_id\)/.test(cuerpo) &&
      /fn_grupo_de_estructura\(NEW\.estructura_egreso_id\)/.test(cuerpo),
    'el ajuste se registra contra el grupo, no contra la fila tocada',
  )
})

test('la bolsa del ciclo suma los ajustes y el cierre historico no los absorbe', () => {
  const cuerpo = compacto(leer('fn_disponible_transferible'))
  assert.ok(/tipo = 'ajuste'/.test(cuerpo), 'lee los ajustes del ciclo')
  assert.ok(/v_ajuste/.test(cuerpo), 'los suma al saldo del grupo')
  const reporte = compacto(leer('fn_reporte_cierre_ciclo'))
  assert.ok(/tipo = 'cierre'/.test(reporte), 'la lectura historica sigue mirando solo los cierres')
})

test('una recategorizacion entre hijos del mismo padre no deja filas en cero', () => {
  const cuerpo = compacto(leer('fn_registrar_ajuste_presupuesto'))
  assert.ok(
    /DELETE FROM public\.p_presupuestos_cierre WHERE tipo = 'ajuste'/.test(cuerpo),
    'el ajuste que se cancela tiene que limpiarse, no quedar como fila en cero',
  )
  assert.ok(/saldo_cierre = 0/.test(cuerpo), 'solo se borra cuando de verdad quedo en cero')
})

test('una recategorizacion mueve el gasto entre padres, no entre movimientos', () => {
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(
    !/INSERT INTO (?:public\.)?p_caja|p_billeteras/.test(cuerpo),
    'recategorizar no puede crear ni mover dinero: cambia la atribucion, no el gasto',
  )
  assert.ok(
    /v_old_grupo := public\.fn_grupo_de_estructura\(OLD\.estructura_egreso_id\)/.test(cuerpo) &&
      /v_new_grupo := public\.fn_grupo_de_estructura\(NEW\.estructura_egreso_id\)/.test(cuerpo),
    'el padre anterior y el nuevo se resuelven por separado',
  )
})

// ─── 2. La pantalla ─────────────────────────────────────────────────────────
//
// El informe del Bloque E y el encargo del dueño: «Quiero que el usuario pueda
// entender por qué aumentó o disminuyó su presupuesto». El ajuste es del ciclo
// ACTIVO y del rubro padre al que pertenece, así que la pantalla lo pide con el mes
// que está mostrando y lo dibuja pegado a la fila de ese padre.

const bloque = (desdeTexto, cierre = '\n}\n') => {
  const desde = pagina.indexOf(desdeTexto)
  assert.ok(desde > -1, `no encontré ${desdeTexto}`)
  const fin = pagina.indexOf(cierre, desde)
  assert.ok(fin > desde, `no encontré el cierre de ${desdeTexto}`)
  return pagina.slice(desde, fin)
}

test('la pantalla pide los ajustes del ciclo visible con el mes que se muestra', () => {
  assert.match(
    pagina,
    /supabase\.rpc\('fn_reporte_ajustes_ciclo', \{ p_mes: mesPeriodoStr \}\)/,
    'la lectura va por la RPC, con el mes visible y su nombre de parámetro real',
  )
  // Es opcional: si falla, la pantalla abre igual (mismo criterio que el cierre).
  const i = pagina.indexOf("supabase.rpc('fn_reporte_ajustes_ciclo'")
  assert.ok(i > -1, 'no encontré la llamada a la RPC')
  const alrededor = pagina.slice(i - 220, i + 220)
  assert.match(alrededor, /try\s*\{/, 'la llamada va dentro de un try')
  assert.match(alrededor, /catch\s*\{/, 'y su catch: el reporte no puede romper la pantalla')
})

test('el ajuste se muestra con su signo y su color, no como un número pelado', () => {
  const helper = bloque('function importeConSigno(')
  assert.match(helper, /n >= 0 \? `\+\$\{fmt\(n\)\}`/, 'el que suma lleva +')
  assert.match(helper, /`-\$\{fmt\(Math\.abs\(n\)\)\}`/, 'el que resta lleva - y el valor absoluto')

  assert.match(
    pagina,
    /className=\{`ajuste-item-importe \$\{suma \? 'positivo' : 'negativo'\}`\}/,
    'el color sale del signo, en un solo lugar',
  )
  assert.match(pagina, /\{importeConSigno\(importe, fmt\)\}/, 'y el importe se pinta con su signo')

  assert.match(css, /\.ajuste-item-importe\.positivo\s*\{[^}]*var\(--mint/, 'verde si suma')
  assert.match(css, /\.ajuste-item-importe\.negativo\s*\{[^}]*var\(--coral/, 'rojo si resta')
})

test('el mes histórico corregido se dice con palabras y sin corrimiento de zona', () => {
  const helper = bloque('function formatMesHistorico(')
  assert.match(helper, /\{ month: 'long', year: 'numeric' \}/, 'se lee como «septiembre 2025»')
  assert.match(
    helper,
    /new Date\(Number\(partes\[1\]\), Number\(partes\[2\]\) - 1, 1\)/,
    'la fecha calendario se arma con sus partes, no como instante',
  )
  assert.ok(
    !/new Date\(iso/.test(helper),
    'new Date("YYYY-MM-DD") la manda a UTC y en UTC-3 muestra el mes anterior',
  )
  assert.match(
    pagina,
    /formatMesHistorico\(ajuste\.ciclo_corregido, locale\)/,
    'el mes que se muestra es el histórico que la corrección cambió',
  )
})

test('si el movimiento ya no existe se dice, y no se inventa una descripción', () => {
  assert.match(
    pagina,
    /const tieneMovimiento =\s*ajuste\.movimiento_fecha !== null/,
    'la referencia se decide por la fecha del movimiento',
  )
  assert.match(pagina, /: t\('budget_adjust_movement_gone'\)/, 'borrado se dice con palabras')
  assert.ok(
    !/antes estaba/i.test(pagina),
    'no hay dato de la categoría anterior: no se puede escribir «antes estaba en X»',
  )
})

test('en un ciclo cerrado no se piden ni se muestran ajustes', () => {
  const iGuarda = pagina.indexOf('if (!cerradoSegunServidor) {')
  const iRpc = pagina.indexOf("supabase.rpc('fn_reporte_ajustes_ciclo'")
  assert.ok(iGuarda > -1, 'la pantalla pregunta primero si el ciclo está cerrado')
  assert.ok(iGuarda < iRpc, 'y la guarda corta ANTES de pedir el reporte')

  const agrupado = bloque('const ajustesPorGrupo = useMemo(')
  assert.match(agrupado, /if \(cicloCerrado\) return mapa/, 'con el ciclo cerrado el mapa queda vacío')
  assert.match(
    pagina,
    /ajustes && ajustes\.length > 0 \? \(/,
    'sin ajustes no se dibuja un bloque vacío ni un cero',
  )
})

test('las claves de los ajustes están en los tres idiomas', () => {
  const claves = [
    'budget_adjust_title',
    'budget_adjust_desc',
    'budget_adjust_month',
    'budget_adjust_made_on',
    'budget_adjust_movement',
    'budget_adjust_movement_gone',
    'budget_adjust_reason_correction',
    'budget_adjust_reason_other',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dict = diccionario(lang)
    for (const clave of claves) {
      assert.ok(dict.includes(`${clave}:`), `${lang} no tiene ${clave}`)
    }
  }
  // Ningún texto del bloque queda hardcodeado en la pantalla (regla 9).
  assert.ok(
    !/Ajustes por corrección histórica/.test(pagina),
    'el título tiene que salir por i18n, no del código',
  )
})
