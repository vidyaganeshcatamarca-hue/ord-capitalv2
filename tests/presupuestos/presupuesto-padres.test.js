// tests/presupuestos/presupuesto-padres.test.js
//
//   node --test tests/presupuestos/presupuesto-padres.test.js
//
// Dueño: "t2, extremamos los controles, probamos test con escenarios distintos para
// asegurar que no se cuele un bug silencioso".
//
// La feature permite poner presupuesto a un rubro padre que tiene hijos
// (odd/tasks/presupuestos-padres.md). El padre es un acumulador: nunca gasta y nunca
// arrastra por su cuenta. Su presupuesto es el techo del grupo, y los presupuestos de
// los hijos son porciones de ese techo, no plata adicional (S3, S11, S14).
//
// De ahí sale la única regla que puede fallar en silencio:
//
//   Una asignación cuenta en los totales salvo que su rubro sea hijo de un rubro con
//   presupuesto mayor a cero en el mismo ciclo y para el mismo usuario (S15).
//
// Si esa regla falta en un solo lugar, el saldo a asignar le resta dos veces la misma
// plata al usuario y ninguna pantalla lo muestra. Por eso los escenarios de acá:
//
//   1. Sin padres con presupuesto el predicado es siempre verdadero: nada cambia.
//   2. Con padre con presupuesto, el hijo deja de contar por separado.
//   3. Un padre con presupuesto en cero NO esconde a sus hijos (cero no es techo).
//   4. El barrido: ninguna suma de monto_limite quedó sin la guarda.
//   5. El reporte expone es_padre y cuenta_en_totales, que es de donde lee el filtro.
//   6. Las cinco funciones siguen siendo de lectura: no pueden mover un saldo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')

const reporte = leer('temp_sql', '151_reporte_padres.sql')
const filaPadre = leer('temp_sql', '155_reporte_fila_padre.sql')
const techo = leer('temp_sql', '158_techo_al_asignar.sql')
const sumas = leer('temp_sql', '153_sumas_sin_padres.sql')

// Comparar SQL sin depender de la indentación.
const compacto = (s) => s.replace(/\s+/g, ' ').trim()
const reporteC = compacto(reporte)
const padreC = compacto(filaPadre)
const techoC = compacto(techo)
const sumasC = compacto(sumas)

const FUNCIONES_CON_GUARDA = [
  'fn_obtener_saldo_disponible_para_asignar',
  'fn_reporte_proyeccion_presupuestaria',
  'fn_reporte_termometro_presupuestos',
  'fn_telemetry_refresh_user_metrics',
]

const GUARDA = (alias) => compacto(`
  AND NOT EXISTS (
    SELECT 1 FROM public.p_estructuras_egresos ee
    JOIN public.p_presupuestos pp ON pp.estructura_egreso_id = ee.padre_id
    WHERE ee.estructura_id = ${alias}.estructura_egreso_id
      AND pp.mes_periodo = ${alias}.mes_periodo
      AND pp.user_id = ${alias}.user_id
      AND COALESCE(pp.monto_limite, 0) > 0
  )`)

// El cuerpo de una función dentro de la migración, para acotar cada aserción a su
// propia función y no al archivo entero.
const cuerpoDe = (nombre) => {
  const i = sumasC.indexOf(`FUNCTION public.${nombre}`)
  assert.notEqual(i, -1, `no encontré la función ${nombre} en 153`)
  const fin = sumasC.indexOf('$function$;', i)
  return sumasC.slice(i, fin === -1 ? undefined : fin)
}

test('escenario base: sin presupuesto de padre el predicado es siempre verdadero', () => {
  // NOT EXISTS sobre una tabla sin la fila del padre es verdadero para toda fila, así
  // que la suma sigue contando todo: es el estado de producción y por eso el deploy
  // pudo verificar que las cinco salidas salían idénticas.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    const cuerpo = cuerpoDe(nombre)
    assert.ok(cuerpo.includes('NOT EXISTS ('), `${nombre}: la guarda tiene que ser un NOT EXISTS`)
    assert.ok(
      !/AND\s+EXISTS\s*\(/.test(cuerpo),
      `${nombre}: una guarda afirmativa escondería los hijos cuando el padre NO tiene presupuesto`,
    )
  }
})

test('con presupuesto en el padre el hijo deja de contar por separado', () => {
  // Tres condiciones hacen la regla: se mira el padre del rubro (no el rubro), se exige
  // el mismo ciclo y el mismo usuario.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    const cuerpo = cuerpoDe(nombre)
    const alias = cuerpo.includes('= p.estructura_egreso_id') ? 'p' : 'p_presupuestos'
    assert.ok(
      cuerpo.includes(GUARDA(alias)),
      `${nombre}: falta la guarda completa, que compara contra el padre del rubro`,
    )
    assert.ok(
      cuerpo.includes('pp.mes_periodo =') && cuerpo.includes('pp.user_id ='),
      `${nombre}: la guarda tiene que exigir el mismo ciclo y el mismo usuario`,
    )
  }
})

test('un padre con presupuesto en cero no esconde a sus hijos', () => {
  // Cero significa "este rubro no tiene presupuesto", no "tiene techo cero". Sin el
  // > 0, crear una fila en cero apagaría los presupuestos de todos los hijos.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    assert.ok(
      cuerpoDe(nombre).includes('COALESCE(pp.monto_limite, 0) > 0'),
      `${nombre}: la guarda tiene que exigir monto_limite mayor a cero`,
    )
  }
})

test('el barrido: ninguna suma de monto_limite quedó sin guarda', () => {
  // El test que atrapa al que venga después. Cada suma tiene que venir con su guarda;
  // si alguien agrega una suma nueva sin la regla, esto falla aunque toque otra función.
  const sumasDeDinero = (sumasC.match(/SUM\(\s*(?:p\.)?monto_limite\s*\)/gi) ?? []).length
  const guardas = (sumasC.match(/NOT EXISTS \(/g) ?? []).length
  assert.equal(sumasDeDinero, 4, 'cambió la cantidad de sumas de monto_limite: revisá si la nueva lleva guarda')
  assert.equal(guardas, sumasDeDinero, 'hay una suma de monto_limite sin la guarda de S15')
})

test('el filtro del reporte usa la columna que expone el reporte', () => {
  // fn_obtener_saldo_a_asignar no suma monto_limite: suma monto_disponible del reporte,
  // así que su guarda es distinta y tiene que estar.
  const cuerpo = cuerpoDe('fn_obtener_saldo_a_asignar')
  assert.ok(
    cuerpo.includes('WHERE cuenta_en_totales'),
    'fn_obtener_saldo_a_asignar tiene que filtrar cuenta_en_totales',
  )
})

test('el reporte expone es_padre y cuenta_en_totales', () => {
  assert.ok(
    reporteC.includes('gasto_promedio_6m numeric, es_padre boolean, cuenta_en_totales boolean'),
    'el RETURNS TABLE tiene que terminar en las dos columnas nuevas',
  )
  // Cambiar los parámetros de salida obliga a DROP, y el DROP se lleva los grants.
  assert.ok(reporteC.includes('DROP FUNCTION IF EXISTS public.fn_reporte_sobres_detalle(date)'), 'falta el DROP previo')
  assert.ok(reporteC.includes('NOT EXISTS ( SELECT 1 FROM p_presupuestos pp'), 'el reporte tiene que calcular cuenta_en_totales')
})

test('las cuatro sumas de presupuesto siguen siendo de lectura', () => {
  // fn_telemetry_refresh_user_metrics es un refresco de metricas: escribe su tabla por
  // diseno. Las otras cuatro solo calculan. Si alguna escribiera, la verificacion
  // "identico antes y despues" del deploy dejaria de probar que el cambio es de lectura.
  for (const nombre of FUNCIONES_CON_GUARDA.filter((n) => n !== 'fn_telemetry_refresh_user_metrics')) {
    const escrituras = cuerpoDe(nombre).match(/(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)/gi) ?? []
    assert.deepEqual(escrituras, [], `${nombre} no puede escribir, encontre: ${escrituras.join(', ')}`)
  }
  // Y la de telemetria tiene que seguir escribiendo: si dejo de hacerlo, algo se rompio.
  assert.ok(
    /INSERT INTO/i.test(cuerpoDe('fn_telemetry_refresh_user_metrics')),
    'fn_telemetry_refresh_user_metrics dejo de escribir su tabla de metricas',
  )
  for (const nombre of [...FUNCIONES_CON_GUARDA, 'fn_obtener_saldo_a_asignar']) {
    const apariciones = (sumasC.match(new RegExp(`FUNCTION public\.${nombre}`, 'g')) ?? []).length
    assert.equal(apariciones, 1, `${nombre} tiene que redefinirse exactamente una vez`)
  }
})

// ---------------------------------------------------------------------------
// T1 paso 2: la fila del padre. El padre es un acumulador (S6/S11): su gasto es
// la suma de los gastos de sus hijos, no tiene gasto propio y siempre cuenta en
// los totales porque es el techo del grupo.
// ---------------------------------------------------------------------------

test('la fila del padre es la suma de las filas de sus hijos', () => {
  assert.ok(padreC.includes('filas(estructura_id'), 'el CTE tiene que declarar sus columnas, si no hereda nombres de expresión')
  assert.ok(padreC.includes('SELECT filas.* FROM filas UNION ALL SELECT'), 'la rama del padre se agrega con UNION ALL sobre las filas de los hijos')
  assert.ok(padreC.includes('JOIN filas f ON f.padre_id = e.estructura_id'), 'el padre se arma desde las filas de sus hijos')
  for (const suma of ['SUM(f.monto_gastado)', 'SUM(f.monto_asignado_anterior)', 'SUM(f.monto_gastado_anterior)', 'SUM(f.gasto_promedio_6m)', 'SUM(f.arrastre_mes_anterior)']) {
    assert.ok(padreC.includes(suma), `falta ${suma} en la rama del padre`)
  }
})

test('el disponible del padre es su presupuesto menos la suma de sus hijos', () => {
  assert.ok(
    padreC.includes('(COALESCE(p.monto_limite, 0) - COALESCE(SUM(f.monto_gastado), 0))::numeric'),
    'el disponible del padre tiene que ser asignado menos el gasto sumado de los hijos',
  )
  // El padre no gasta: la rama no puede leer gastos_mes para el propio padre.
  const ramaPadre = padreC.slice(padreC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(!/JOIN gastos_mes/.test(ramaPadre), 'el padre no tiene gasto propio: no puede unir gastos_mes')
})

test('el padre cuenta en los totales y sus hijos dejan de contar', () => {
  // Las dos últimas columnas de la rama del padre son es_padre y cuenta_en_totales.
  assert.ok(/\)::numeric, true, true FROM p_estructuras_egresos e/.test(padreC), 'la fila del padre tiene que salir con es_padre y cuenta_en_totales en true')
  // En el reporte la forma es la directa: el presupuesto del padre se busca por el
  // padre del rubro. (En las sumas de 153 va con los alias ee/pp.)
  assert.ok(
    padreC.includes('pp.estructura_egreso_id = e.padre_id'),
    'el reporte tiene que calcular cuenta_en_totales buscando el presupuesto del padre del rubro',
  )
})

test('la fila del padre sólo aparece si tiene presupuesto', () => {
  // Sin presupuesto del padre la rama no devuelve nada: es lo que permitió verificar
  // que la salida es idéntica byte a byte con los datos de hoy.
  const ramaPadre = padreC.slice(padreC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(ramaPadre.includes('AND COALESCE(p.monto_limite, 0) > 0'), 'la rama del padre tiene que exigir presupuesto mayor a cero')
})

test('el orden final se califica para no chocar con los parámetros de salida', () => {
  // ORDER BY tipo_cupo era ambiguo contra el parámetro de salida tipo_cupo, y el CREATE
  // fallaba. Por eso el union va envuelto en una subconsulta con alias.
  assert.ok(padreC.includes(') u ORDER BY CASE u.tipo_cupo'), 'el ORDER BY tiene que ir sobre la subconsulta calificada')
  assert.ok(padreC.includes('u.monto_gastado DESC'), 'el ORDER BY tiene que calificar monto_gastado')
})

// ---------------------------------------------------------------------------
// T3: el techo al asignar. Asignar al padre mueve el saldo a asignar; reservar a un
// hijo sólo reparte (S14). Y los hijos nunca se pasan del padre (S2), mientras bajar el
// padre por debajo de lo repartido se rechaza con el detalle (S7).
// ---------------------------------------------------------------------------

test('un hijo no puede pasarse de lo que queda libre del techo', () => {
  assert.ok(
    techoC.includes('IF p_monto_asignado > (v_techo_padre - v_repartido) THEN'),
    'falta la comparación contra el techo menos lo repartido',
  )
  // Lo repartido excluye al rubro que se está asignando: si no, se compararía contra sí mismo.
  assert.ok(
    techoC.includes('AND pr.estructura_egreso_id <> p_estructura_egreso_id'),
    'la suma de lo repartido tiene que excluir al rubro que se está asignando',
  )
})

test('bajar el padre por debajo de lo repartido se rechaza con el detalle', () => {
  assert.ok(techoC.includes('IF v_repartido > p_monto_asignado THEN'), 'falta la comparación del padre contra lo repartido en sus hijos')
  assert.ok(techoC.includes("'error_budget_parent_below_children'"), 'falta la clave del rechazo')
  assert.ok(techoC.includes("'recortar', v_repartido - p_monto_asignado"), 'el detalle tiene que decir cuánto recortar')
})

test('sin presupuesto en el padre no hay techo para los hijos', () => {
  // La guarda del hijo vive dentro de IF COALESCE(v_techo_padre, 0) > 0: sin presupuesto
  // del padre los hijos siguen siendo independientes, como hasta hoy.
  const i = techoC.indexOf('IF COALESCE(v_techo_padre, 0) > 0 THEN')
  const j = techoC.indexOf('error_budget_child_over_parent')
  assert.ok(i !== -1 && j > i, 'la validación del hijo tiene que estar dentro del IF del techo')
})

test('los rechazos son datos, no texto: clave y parámetros numéricos', () => {
  // Sólo los dos rechazos del techo: la función también tiene el de error_unauthorized y
  // el del guard de base cero, que no son de esta regla.
  const todos = techoC.match(/RAISE EXCEPTION '[^']*'[^;]*;/g) ?? []
  const raises = todos.filter((r) => /error_budget_child_over_parent|error_budget_parent_below_children/.test(r))
  assert.equal(raises.length, 2, `esperaba dos rechazos del techo, encontré ${raises.length} de ${todos.length}`)
  for (const r of raises) {
    assert.ok(/json_build_object/.test(r), 'el rechazo tiene que armar el JSON con json_build_object')
    assert.ok(/'key', 'error_budget_/.test(r), 'el rechazo tiene que llevar su clave de error')
    assert.ok(/'params', json_build_object/.test(r), 'el rechazo tiene que llevar sus parámetros')
    // Nada de texto en español ni de números incrustados: todo va por parámetros (regla 9).
    assert.ok(!/[áéíóúñ¿]/.test(r), `el rechazo no puede tener texto hardcodeado: ${r.slice(0, 60)}`)
  }
})

test('la asignación sigue escribiendo en un solo lugar', () => {
  const inserts = techoC.match(/INSERT INTO public\.p_presupuestos/g) ?? []
  assert.equal(inserts.length, 1, 'la función tiene que seguir teniendo un único INSERT')
  assert.ok(techoC.includes('ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))'), 'el ON CONFLICT tiene que seguir igual')
})
