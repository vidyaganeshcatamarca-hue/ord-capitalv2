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
const transferencias = leer('temp_sql', '160_techo_en_transferencias.sql')
const arrastre = leer('temp_sql', '162_arrastre_base_cero.sql')
const asignarBaseCero = leer('temp_sql', '164_base_cero_hijo_dentro_del_techo.sql')
const padreVisible = leer('temp_sql', '167_padre_siempre_visible.sql')
const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const sumas = leer('temp_sql', '153_sumas_sin_padres.sql')

// Comparar SQL sin depender de la indentación.
const compacto = (s) => s.replace(/\s+/g, ' ').trim()
const reporteC = compacto(reporte)
const padreC = compacto(filaPadre)
const techoC = compacto(techo)
const transC = compacto(transferencias)
const arrC = compacto(arrastre)
const bcC = compacto(asignarBaseCero)
const visC = compacto(padreVisible)
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

// ---------------------------------------------------------------------------
// T4: el mismo techo en las transferencias. Mover plata entre sobres tambien cambia
// monto_limite, asi que sin esta guarda el techo se salteaba con una transferencia.
// ---------------------------------------------------------------------------

test('una transferencia no puede dejar al destino hijo por encima del techo', () => {
  assert.ok(
    transC.includes('IF (COALESCE(v_actual_destino, 0) + p_monto) > (v_techo_destino - v_repartido_destino) THEN'),
    'falta la comparación del valor resultante del destino contra lo libre del techo',
  )
  assert.ok(
    transC.includes('AND pr.estructura_egreso_id <> p_destino_id'),
    'la suma de lo repartido tiene que excluir al destino',
  )
  assert.ok(transC.includes("'error_budget_child_over_parent'"), 'el rechazo tiene que usar la misma clave que la asignación')
})

test('una transferencia no puede dejar al padre origen por debajo de lo repartido', () => {
  assert.ok(
    transC.includes('IF EXISTS (SELECT 1 FROM public.p_estructuras_egresos h WHERE h.padre_id = p_origen_id) THEN'),
    'la guarda del origen tiene que aplicar sólo si el origen es padre con hijos',
  )
  assert.ok(
    transC.includes('IF (COALESCE(v_actual_origen, 0) - p_monto) < v_repartido_origen THEN'),
    'falta la comparación del padre resultante contra lo repartido',
  )
  assert.ok(transC.includes("'error_budget_parent_below_children'"), 'el rechazo tiene que usar la misma clave que la asignación')
  assert.ok(transC.includes("'recortar', v_repartido_origen - (COALESCE(v_actual_origen, 0) - p_monto)"), 'el detalle tiene que decir cuánto recortar')
})

test('las validaciones van antes de la primera escritura', () => {
  // La función mueve plata con un UPDATE y un INSERT sueltos: si el rechazo llegara
  // después del UPDATE, la transferencia quedaría a medias.
  const iUpdate = transC.indexOf('UPDATE p_presupuestos SET monto_limite = monto_limite - p_monto')
  const iDestino = transC.indexOf('error_budget_child_over_parent')
  const iOrigen = transC.indexOf('error_budget_parent_below_children')
  assert.ok(iUpdate > 0 && iDestino > 0 && iOrigen > 0, 'no encontré alguna de las tres piezas')
  assert.ok(iDestino < iUpdate && iOrigen < iUpdate, 'las dos validaciones tienen que estar antes del UPDATE del origen')
})

test('los rechazos de la transferencia también son datos', () => {
  const todos = transC.match(/RAISE EXCEPTION '[^']*'[^;]*;/g) ?? []
  const nuevos = todos.filter((r) => /error_budget_child_over_parent|error_budget_parent_below_children/.test(r))
  assert.equal(nuevos.length, 2, `esperaba dos rechazos del techo, encontré ${nuevos.length} de ${todos.length}`)
  for (const r of nuevos) {
    assert.ok(/'params', json_build_object/.test(r), 'el rechazo tiene que llevar sus parámetros')
    assert.ok(!/[áéíóúñ¿]/.test(r), 'el rechazo no puede tener texto hardcodeado')
  }
})

test('la transferencia sigue moviendo plata en dos pasos, no más', () => {
  assert.equal((transC.match(/UPDATE p_presupuestos/g) ?? []).length, 1, 'tiene que haber un solo UPDATE')
  assert.equal((transC.match(/INSERT INTO p_presupuestos/g) ?? []).length, 1, 'tiene que haber un solo INSERT')
})

// ---------------------------------------------------------------------------
// T5: base cero arrastra el sobrante y el deficit, sin resucitar el modo viejo.
// ---------------------------------------------------------------------------

test('base cero arrastra, pero sólo entre ciclos que ya eran base cero', () => {
  assert.ok(
    arrC.includes("v_arrastre_cero := (v_modo_presupuesto = 'base_cero' AND (v_fecha_activacion IS NULL OR v_fecha_activacion > v_f_fin_ant));"),
    'el arrastre tiene que exigir base cero Y que el ciclo anterior haya terminado dentro de la era base cero',
  )
})

test('un rubro sin presupuesto en el ciclo anterior no arrastra nada', () => {
  // Sin esta guarda cada gasto sin sobre se convierte en una deuda falsa (0 - gasto).
  // Medido en noviembre del usuario 1: con la guarda el arrastre pasó de -2.852.700 en 10
  // sobres a -285.840 en 5, que son los rubros que sí tenían presupuesto.
  assert.ok(
    arrC.includes('CASE WHEN v_arrastre_cero OR COALESCE(p.monto_limite, 0) <= 0 THEN 0'),
    'el arrastre tiene que ser cero cuando el límite anterior era cero',
  )
})

test('libertad sigue sin arrastre', () => {
  // En anticipado el disponible se calcula con el arrastre en cero. Si alguien toca esa
  // expresión, esto falla.
  assert.ok(arrC.includes("CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END"),
    'el disponible del padre tiene que ignorar el arrastre en libertad')
  assert.ok((arrC.match(/v_modo_presupuesto = 'anticipado' THEN 0::numeric/g) ?? []).length >= 3,
    'las expresiones de estado y disponible de las hojas tienen que seguir ignorando el arrastre en libertad')
})

test('el disponible del padre incluye el arrastre de sus hijos', () => {
  // Si no, el grupo mostraría el presupuesto pelado mientras los hijos muestran su arrastre.
  assert.ok(
    arrC.includes("CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END + COALESCE(p.monto_limite, 0) - COALESCE(SUM(f.monto_gastado), 0)"),
    'el disponible del padre tiene que sumar el arrastre de los hijos',
  )
})

// ---------------------------------------------------------------------------
// T6: la fila del padre se despliega en la misma lista. El dueño eligió que sea
// expandible en lugar de partir la pantalla en dos niveles.
// ---------------------------------------------------------------------------

test('el total del grupo cuenta una sola vez', () => {
  // Mientras el padre y sus hijos venían en la misma lista, el total del grupo los sumaba
  // a los dos y mostraba el doble de lo comprometido.
  const bloque = pagina.slice(pagina.indexOf('function GrupoAcordeon'), pagina.indexOf('function GrupoAcordeon') + 3000)
  assert.ok(bloque.includes('cuenta_en_totales !== false'), 'el total del grupo tiene que ignorar las filas que no cuentan')
  assert.ok(bloque.includes('.reduce((s, i) => s + Number(i.monto_asignado ?? 0), 0)'), 'el total del grupo tiene que salir de las filas que cuentan')
})

test('los hijos se dibujan debajo del padre y no se repiten arriba', () => {
  const bloque = pagina.slice(pagina.indexOf('function GrupoAcordeon'), pagina.indexOf('function GrupoAcordeon') + 3000)
  assert.ok(bloque.includes('const padres = new Set(items.filter(i => i.es_padre)'), 'falta detectar los padres con presupuesto')
  assert.ok(bloque.includes('if (s.padre_id != null && padres.has(s.padre_id)) continue'), 'un hijo de un padre con presupuesto no puede aparecer dos veces')
  assert.ok(bloque.includes('visibles.push({ sobre: h, hija: true })'), 'los hijos tienen que entrar indentados debajo del padre')
  assert.ok(bloque.includes('expandidos[s.estructura_id]'), 'sólo se despliegan si el grupo está abierto')
})

test('el monto libre del grupo es el techo menos lo repartido', () => {
  assert.ok(pagina.includes('const libreDe = (padreId: number) =>'), 'falta el cálculo del libre del grupo')
  const bloque = pagina.slice(pagina.indexOf('const libreDe'), pagina.indexOf('const libreDe') + 400)
  assert.ok(bloque.includes('monto_asignado ?? 0) -'), 'el libre tiene que restar lo repartido del techo')
  assert.ok(bloque.includes('x.padre_id === padreId'), 'lo repartido se suma sobre los hijos del padre')
})

test('la fila del padre y la hija se distinguen en el marcado', () => {
  assert.ok(pagina.includes('sobre-fila--hija'), 'la hija necesita su clase para ir indentada')
  assert.ok(pagina.includes('aria-expanded={!!expandido}'), 'el chevron tiene que anunciar si el grupo está abierto')
  assert.ok(pagina.includes("aria-label={t(expandido ? 'budget_group_collapse' : 'budget_group_expand')}"), 'el chevron necesita etiqueta traducida')
  assert.ok(pagina.includes('es_padre?: boolean') && pagina.includes('cuenta_en_totales?: boolean'), 'SobreDetalle tiene que declarar los dos campos del reporte')
})

test('los dos rechazos del techo se explican con sus números', () => {
  const bloque = pagina.slice(pagina.indexOf('function mensajeRechazoPresupuesto'), pagina.indexOf('interface SobreDetalle'))
  assert.ok(bloque.includes("parsed?.key === 'error_budget_child_over_parent'"), 'falta el mapeo del rechazo del hijo')
  assert.ok(bloque.includes("parsed?.key === 'error_budget_parent_below_children'"), 'falta el mapeo del rechazo del padre')
  for (const param of ['techo', 'repartido', 'disponible', 'recortar']) {
    assert.ok(bloque.includes(param), `el mensaje tiene que recibir ${param}`)
  }
  // Y el catch de la asignación tiene que usarlo antes que los mensajes genéricos.
  const catchAsignar = pagina.slice(pagina.indexOf('const rechazo = mensajeRechazoPresupuesto'), pagina.indexOf('const rechazo = mensajeRechazoPresupuesto') + 300)
  assert.ok(catchAsignar.includes("? rechazo"), 'si hay rechazo del techo, ese mensaje gana al genérico')
})

// ---------------------------------------------------------------------------
// T3b: en base cero, reservar a un hijo dentro del techo del padre no toca el pozo.
// Defecto encontrado preparando las pruebas de UI sobre el usuario 198: el guard del
// pozo se disparaba antes del techo y rechazaba cualquier asignación a un hijo.
// ---------------------------------------------------------------------------

test('el techo del padre se busca antes del guard de base cero', () => {
  const iLookup = bcC.indexOf('SELECT padre_id INTO v_padre_id')
  const iGuard = bcC.indexOf("IF v_modo_presupuesto = 'base_cero' THEN")
  assert.ok(iLookup !== -1 && iGuard !== -1, 'no encontré el lookup del padre o el guard de base cero')
  assert.ok(iLookup < iGuard, 'el padre y su techo tienen que resolverse antes del guard, si no no se puede saltear')
})

test('el guard del pozo se saltea cuando el rubro vive dentro de un techo', () => {
  assert.ok(
    bcC.includes('IF COALESCE(v_techo_padre, 0) = 0 AND p_monto_asignado > (v_saldo_disponible + v_monto_previo) THEN'),
    'el guard del pozo tiene que exigir que el rubro NO tenga techo de padre',
  )
  // El guard del pozo no usa json_build_object: lleva la clave dentro del JSON literal,
  // con comillas dobles. Por eso se busca el nombre de la clave, sin comillas.
  assert.ok(bcC.includes('error_budget_insufficient_base_zero'), 'el guard del pozo tiene que seguir existiendo para los rubros sin techo')
})

test('el padre se resuelve una sola vez', () => {
  assert.equal((bcC.match(/SELECT padre_id INTO v_padre_id/g) ?? []).length, 1, 'el lookup del padre no puede quedar duplicado')
  assert.equal((bcC.match(/SELECT monto_limite INTO v_techo_padre/g) ?? []).length, 1, 'la lectura del techo no puede quedar duplicada')
})

test('el techo sigue rechazando después del cambio', () => {
  // Las dos validaciones de T3 no se pierden al mover el lookup.
  assert.ok(bcC.includes('IF p_monto_asignado > (v_techo_padre - v_repartido) THEN'), 'falta el rechazo del hijo sobre el techo')
  assert.ok(bcC.includes('IF v_repartido > p_monto_asignado THEN'), 'falta el rechazo del padre por debajo de lo repartido')
  const iInsert = bcC.indexOf('INSERT INTO public.p_presupuestos')
  assert.ok(bcC.indexOf('error_budget_child_over_parent') < iInsert, 'el rechazo tiene que seguir antes del INSERT')
})

// ---------------------------------------------------------------------------
// T6c: el rubro padre aparece aunque no tenga presupuesto.
// Dueño: "No puedo ver las categorias padres en el modulo de presupuestos". La fila se
// emitía sólo con presupuesto mayor a cero, y la lista se arma con este reporte: era
// imposible asignarle uno.
// ---------------------------------------------------------------------------

test('el padre se emite aunque no tenga presupuesto', () => {
  assert.ok(visC.includes('LEFT JOIN p_presupuestos p ON p.estructura_egreso_id = e.estructura_id'), 'el presupuesto del padre tiene que ser LEFT JOIN para que la fila exista sin él')
  const ramaPadre = visC.slice(visC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(!ramaPadre.includes('COALESCE(p.monto_limite, 0) > 0'), 'no puede quedar el filtro que escondía al padre sin presupuesto')
})

test('el padre aparece sólo si tiene hijos', () => {
  // El JOIN con las filas de los hijos es lo que distingue un padre de un rubro suelto.
  const ramaPadre = visC.slice(visC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(ramaPadre.includes('JOIN filas f ON f.padre_id = e.estructura_id'), 'sin hijos no hay fila de padre')
})

test('sin presupuesto del padre los hijos siguen contando', () => {
  // cuenta_en_totales depende de que el padre tenga presupuesto mayor a cero; ese
  // predicado no se toca en 167.
  assert.ok(visC.includes('AND pp.mes_periodo = v_mes_truncado'), 'la regla de cuenta_en_totales tiene que seguir en 167')
  assert.ok(visC.includes('AND COALESCE(pp.monto_limite, 0) > 0'), 'el hijo sólo deja de contar cuando el padre tiene presupuesto')
})

test('la UI arranca con el grupo desplegado', () => {
  assert.ok(pagina.includes('expandidos[s.estructura_id] !== false'), 'el grupo tiene que arrancar abierto para que los hijos no desaparezcan')
})
