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

const leerFuncion = (nombre) => leer('funcionesSQL', `${nombre}.md`)

// 151, 155, 162 y 167 son cuatro pasos sobre la MISMA función: el espejo es su
// estado final desplegado, así que las cuatro lecturas apuntan ahí.
const reporte = leerFuncion('fn_reporte_sobres_detalle')
const filaPadre = reporte
const arrastre = reporte
const padreVisible = reporte
// 158 y 168 también son la misma función: fn_asignar_presupuesto.
const techo = leerFuncion('fn_asignar_presupuesto')
const asignarBaseCero = techo
const transferencias = leerFuncion('fn_transferir_entre_sobres')
const pagina = leer('src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx')
const cssPagina = leer('src', 'pages', 'Presupuestos', 'Presupuestos.css')
// 153 toca cinco funciones distintas; el test las recorta una por una con cuerpoDe(),
// asi que la unión no mezcla cuerpos en una misma aserción.
const sumas = [
  'fn_obtener_saldo_disponible_para_asignar',
  'fn_reporte_proyeccion_presupuestaria',
  'fn_reporte_termometro_presupuestos',
  'fn_telemetry_refresh_user_metrics',
  'fn_obtener_saldo_a_asignar',
]
  .map(leerFuncion)
  .join('\n')

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

// El cuerpo de una función dentro del espejo, para acotar cada aserción a su propia
// función y no al archivo entero. Los espejos cierran con $function$ sin ';', así que
// el recorte no puede buscar '$function$;' o se lleva la función siguiente.
const cuerpoDe = (nombre) => {
  const i = sumasC.indexOf(`FUNCTION public.${nombre}`)
  assert.notEqual(i, -1, `no encontré la función ${nombre} en los espejos de funcionesSQL/`)
  // Cuidado: el cuerpo ABRE con `AS $function$` y CIERRA con otro `$function$`. Buscar el
  // primero devuelve solo la firma, y todas las aserciones sobre el cuerpo se vuelven
  // vacuas. Hay que saltar la apertura y cortar en el cierre.
  const apertura = sumasC.indexOf('$function$', i)
  if (apertura === -1) return sumasC.slice(i)
  const cierre = sumasC.indexOf('$function$', apertura + '$function$'.length)
  return sumasC.slice(apertura + '$function$'.length, cierre === -1 ? undefined : cierre)
}

test('escenario base: sin presupuesto de padre el predicado es siempre verdadero', () => {
  // Plan §2.4: «Las dos validaciones que existen porque hoy hay plata en dos lugares
  // —“no entra en el techo repartido” y “no podés bajar del repartido”— dejan de tener
  // sentido», y el anexo de la misma etapa: «fuera error_budget_child_over_parent y
  // error_budget_parent_below_children». Con una sola bolsa por grupo el predicado que
  // decide qué suma no puede depender del techo del padre, así que no puede haber una
  // guarda afirmativa que esconda a los hijos porque el padre no tenga presupuesto.
  //
  // La aserción está invertida respecto de la versión vieja: antes se exigía que la
  // guarda existiera (NOT EXISTS); ahora se exige que el rechazo por techo repartido
  // esté ausente. En fn_asignar_presupuesto y en el reporte ya está ausente; las dos
  // claves siguen vivas en fn_transferir_entre_sobres, y eso se reporta aparte porque
  // este test no lo cubre.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    const cuerpo = cuerpoDe(nombre)
    assert.ok(
      !/AND\s+EXISTS\s*\(/.test(cuerpo),
      `${nombre}: una guarda afirmativa escondería los hijos cuando el padre NO tiene presupuesto`,
    )
    assert.ok(
      !/error_budget_child_over_parent|error_budget_parent_below_children/.test(cuerpo),
      `${nombre}: el rechazo por techo repartido está retirado (§2.4)`,
    )
  }
  // Y la regla que lo reemplaza es estructural: la subcategoría no cuenta nunca, así que
  // el predicado no puede depender del presupuesto del padre (§2.2).
  assert.ok(
    reporteC.includes('(e.padre_id IS NULL) AS cuenta_en_totales'),
    'cuenta el rubro sin padre: el resto entra por la fila del padre, no por el techo del padre',
  )
})

test('con presupuesto en el padre el hijo deja de contar por separado', () => {
  // Plan §2.2: «La subcategoría pierde plata y arrastre propios. Su arrastre sube al
  // padre», y la columna lo dice de forma estructural: la subcategoría no cuenta nunca y
  // el padre siempre cuenta. Así cada grupo aporta exactamente una fila, sin depender de
  // que el padre tenga presupuesto. Eso subsume la guarda vieja, que sólo dejaba de
  // contar al hijo cuando el padre tenía presupuesto > 0.
  assert.ok(
    reporteC.includes('(e.padre_id IS NULL) AS cuenta_en_totales'),
    'la subcategoría no cuenta en los totales: cuenta el rubro sin padre (§2.2)',
  )
  assert.ok(
    /\)::numeric, true, true FROM p_estructuras_egresos e/.test(padreC),
    'la fila del padre tiene que salir con es_padre y cuenta_en_totales en true (§2.2)',
  )
  // Mientras la guarda siga existiendo en alguna función, tiene que estar completa: se
  // mira el padre del rubro (no el rubro), con el mismo ciclo y el mismo usuario. Las
  // funciones que ya no agregan presupuestos por fila no tienen guarda que revisar.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    const cuerpo = cuerpoDe(nombre)
    if (!cuerpo.includes('NOT EXISTS (')) continue
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
  //
  // Plan §2.2: la garantía fuerte ya no depende de esta guarda, porque el hijo no cuenta
  // nunca y el padre cuenta siempre; cero y ausencia de fila son lo mismo. Donde la
  // guarda sobreviva, el operador sigue siendo > 0 y no >= 0.
  for (const nombre of FUNCIONES_CON_GUARDA) {
    const cuerpo = cuerpoDe(nombre)
    if (!cuerpo.includes('NOT EXISTS (')) continue
    assert.ok(
      cuerpo.includes('COALESCE(pp.monto_limite, 0) > 0'),
      `${nombre}: la guarda tiene que exigir monto_limite mayor a cero`,
    )
    assert.ok(
      !cuerpo.includes('COALESCE(pp.monto_limite, 0) >= 0'),
      `${nombre}: cero no puede ser techo: >= 0 apagaría a los hijos`,
    )
  }
})

test('el barrido: ninguna suma de monto_limite quedó sin guarda', () => {
  // El test que atrapa al que venga después. Cada suma tiene que venir con su guarda;
  // si alguien agrega una suma nueva sin la regla, esto falla aunque toque otra función.
  const sumasDeDinero = (sumasC.match(/SUM\(\s*(?:p\.)?monto_limite\s*\)/gi) ?? []).length
  const guardas = (sumasC.match(/NOT EXISTS \(/g) ?? []).length
  assert.equal(sumasDeDinero, 3, 'cambió la cantidad de sumas de monto_limite: revisá si la nueva lleva guarda')
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
  // Plan §2.2: «la subcategoría no cuenta nunca en los totales… la bolsa es del padre,
  // que siempre cuenta». El reporte ya no deduce cuenta_en_totales buscando el
  // presupuesto del padre: lo resuelve con la forma del árbol, que no puede quedar
  // desactualizada.
  assert.ok(
    reporteC.includes('(e.padre_id IS NULL) AS cuenta_en_totales'),
    'el reporte tiene que calcular cuenta_en_totales por la forma del árbol y no por el presupuesto del padre (§2.2)',
  )
  assert.ok(
    /\)::numeric, true, true FROM p_estructuras_egresos e/.test(padreC),
    'la fila del padre tiene que salir con es_padre y cuenta_en_totales en true (§2.2)',
  )
  // La aserción del DROP previo se retiró: el DROP es del script de despliegue, no de la
  // función. Plan, Etapa 0 (§4.1): «Refrescar desde lo instalado las copias del proyecto
  // del módulo» — el espejo es la definición instalada (pg_proc.prosrc) y por definición
  // no puede contener el DROP ni los GRANT que se lleva puesto. Queda sin cobertura de
  // regresión esa parte; se anota en el reporte.
})

test('las cuatro sumas de presupuesto siguen siendo de lectura', () => {
  // fn_telemetry_refresh_user_metrics es un refresco de metricas: escribe su tabla por
  // diseno. Las otras cuatro solo calculan. Si alguna escribiera, la verificacion
  // "identico antes y despues" del deploy dejaria de probar que el cambio es de lectura.
  for (const nombre of FUNCIONES_CON_GUARDA.filter((n) => n !== 'fn_telemetry_refresh_user_metrics')) {
    // El patrón tenía un \b literal de byte 0x08 en lugar de un word boundary, así que
    // nunca encontraba nada y la aserción pasaba sin mirar. Se corrige: la regla es la
    // misma (estas funciones no escriben), pero ahora se comprueba de verdad.
    const escrituras = cuerpoDe(nombre).match(/\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/gi) ?? []
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
  const sinComentarios = (s) => compacto(s.replace(/--[^\r\n]*/g, ''))
  const padreUnido = sinComentarios(filaPadre)
  assert.ok(padreUnido.includes('SELECT filas.* FROM filas UNION ALL SELECT'), 'la rama del padre se agrega con UNION ALL sobre las filas de los hijos')
  assert.ok(padreC.includes('JOIN filas f ON f.padre_id = e.estructura_id'), 'el padre se arma desde las filas de sus hijos')
  // Plan §2.1: la fila del padre es «lo que arrastra (con su signo) + lo asignado − lo
  // gastado por el grupo, incluido lo gastado en el padre mismo», y sin piso artificial
  // por fila. Los totales históricos (asignado y gastado del mes anterior, promedio de
  // seis meses) siguen siendo la suma de los hijos. El arrastre y el disponible ya no se
  // suman fila por fila: son la bolsa del grupo, que sale de fn_disponible_transferible,
  // la misma cuenta que usa el validador de transferencias.
  for (const suma of ['SUM(f.monto_gastado)', 'SUM(f.monto_asignado_anterior)', 'SUM(f.monto_gastado_anterior)', 'SUM(f.gasto_promedio_6m)']) {
    assert.ok(padreC.includes(suma), `falta ${suma} en la rama del padre`)
  }
  assert.ok(
    padreC.includes('public.fn_disponible_transferible(e.estructura_id, v_mes_truncado) AS bolsa'),
    'el disponible y el arrastre del padre salen de la bolsa del grupo (§2.1), no de sumar los arrastres de los hijos',
  )
  assert.ok(
    !padreC.includes('SUM(f.arrastre_mes_anterior)'),
    'el arrastre del padre ya no se suma fila por fila: la subcategoría no arrastra por su cuenta (§2.2)',
  )
})

test('el disponible del padre es su presupuesto menos la suma de sus hijos', () => {
  // Plan §2.1: «Una sola definición de la bolsa del padre… Sin piso artificial por fila»,
  // y §2.3: «para cada padre, el número de la fila, el de la lista de orígenes y el de la
  // validación son iguales». El disponible del padre ya no es “presupuesto menos gasto
  // sumado”: es la bolsa del grupo, tal cual, con su signo.
  assert.ok(
    padreC.includes('b.bolsa::numeric'),
    'el disponible del padre tiene que ser la bolsa del grupo tal cual, sin recortar en cero',
  )
  assert.ok(
    !padreC.includes('(COALESCE(p.monto_limite, 0) - COALESCE(SUM(f.monto_gastado), 0))::numeric'),
    'la fórmula vieja de “presupuesto menos gasto” ya no va (§2.1)',
  )
  // Plan §2.1: el gasto del grupo «incluye lo gastado en el padre mismo», que la rama
  // vieja ignoraba.
  const ramaPadre = padreC.slice(padreC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(ramaPadre.includes('gp.gasto_propio'), 'el gasto del padre mismo tiene que entrar en el total del grupo (§2.1)')
  assert.ok(!/JOIN gastos_mes/.test(ramaPadre), 'el padre no arma su gasto con la CTE de las hojas')
})

test('el padre cuenta en los totales y sus hijos dejan de contar', () => {
  // Las dos últimas columnas de la rama del padre son es_padre y cuenta_en_totales.
  assert.ok(/\)::numeric, true, true FROM p_estructuras_egresos e/.test(padreC), 'la fila del padre tiene que salir con es_padre y cuenta_en_totales en true')
  // Plan §2.2: la subcategoría no cuenta nunca y el padre cuenta siempre, así que la
  // columna se resuelve por la forma del árbol. (La búsqueda del presupuesto del padre,
  // que era la forma vieja de decidirlo, se retiró con la guarda de S15.)
  assert.ok(
    padreC.includes('(e.padre_id IS NULL) AS cuenta_en_totales'),
    'el reporte tiene que calcular cuenta_en_totales por la forma del árbol (§2.2)',
  )
  assert.ok(
    !padreC.includes('pp.estructura_egreso_id = e.padre_id'),
    'la fila del padre ya no se decide buscando su presupuesto (§2.2)',
  )
})

test('la fila del padre sólo aparece si tiene presupuesto', () => {
  // INVERTIDA. Plan §2.1: la fila del padre ES la bolsa del grupo, y §2.2: «la bolsa es
  // del padre, que siempre cuenta». Una fila que sólo existe cuando hay presupuesto deja
  // al padre sin manera de recibir uno: era el defecto T6c (“No puedo ver las categorias
  // padres en el modulo de presupuestos”). El filtro por monto_limite se retiró.
  const ramaPadre = padreC.slice(padreC.indexOf('SELECT filas.* FROM filas'))
  assert.ok(
    !ramaPadre.includes('COALESCE(p.monto_limite, 0) > 0'),
    'la rama del padre no puede exigir presupuesto: sin él no habría dónde asignarlo',
  )
  assert.ok(
    ramaPadre.includes('LEFT JOIN p_presupuestos p ON p.estructura_egreso_id = e.estructura_id'),
    'el presupuesto del padre tiene que ser LEFT JOIN para que la fila exista sin él',
  )
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
  // INVERTIDA. Plan §2.4: «Las dos validaciones que existen porque hoy hay plata en dos
  // lugares —“no entra en el techo repartido” y “no podés bajar del repartido”— dejan de
  // tener sentido»; anexo de la misma etapa: «fuera error_budget_child_over_parent y
  // error_budget_parent_below_children». Etapa 1: «Las transferencias dependen del saldo
  // presupuestario del padre, nunca de los techos de los hijos», y criterio 18.
  //
  // Con una sola bolsa por grupo no hay techo que repartir: el hijo no recibe plata
  // (§1.3, ya desplegado en el servidor) y el único límite es el pozo.
  assert.ok(
    !techoC.includes('error_budget_child_over_parent'),
    'el rechazo por techo repartido tiene que estar ausente (§2.4)',
  )
  assert.ok(!techoC.includes('v_techo_padre'), 'la asignación no puede resolver un techo del padre para repartirlo entre los hijos')
  assert.ok(!techoC.includes('v_repartido'), 'no hay “lo repartido” contra lo que comparar')
  // Lo que sí manda: la plata vive en el padre y el servidor rechaza asignarle a la
  // subcategoría (§1.3).
  assert.ok(
    techoC.includes('error_budget_child_holds_no_money'),
    'la plata vive en el padre: asignar a una subcategoría se rechaza en el servidor (§1.3)',
  )
})

test('bajar el padre por debajo de lo repartido se rechaza con el detalle', () => {
  // INVERTIDA. Plan §2.4 y anexo: la segunda validación retirada es
  // error_budget_parent_below_children, junto con el detalle “recortar” que la
  // acompañaba. Criterio 18: una operación no se autoriza ni se bloquea por los techos de
  // los hijos sino por el saldo presupuestario del padre.
  assert.ok(
    !techoC.includes('error_budget_parent_below_children'),
    'el rechazo por bajar del repartido tiene que estar ausente (§2.4)',
  )
  assert.ok(!techoC.includes("'recortar'"), 'el detalle “recortar” se fue con el rechazo')
})

test('sin presupuesto en el padre no hay techo para los hijos', () => {
  // INVERTIDA. La guarda vieja vivía dentro de IF COALESCE(v_techo_padre, 0) > 0. Plan
  // §2.4 retira la validación, así que el techo del padre no puede condicionar nada: ni
  // con presupuesto ni sin él. El único límite que queda es el pozo de base cero, que no
  // depende del padre (§1.4: se controla que nadie mueva más de lo que tiene).
  assert.ok(
    !techoC.includes('IF COALESCE(v_techo_padre, 0) > 0 THEN'),
    'no puede quedar el IF que condicionaba la validación del hijo',
  )
  assert.ok(
    techoC.includes('error_budget_insufficient_base_zero'),
    'el guard del pozo de base cero sigue existiendo, y no depende del padre',
  )
})

test('los rechazos son datos, no texto: clave y parámetros numéricos', () => {
  // Criterio 14: invalida la etapa «un mensaje técnico crudo a la vista» o un texto sin
  // traducir; y la regla 9 del repo prohíbe el español hardcodeado. Etapa 1.3 pide que el
  // rechazo de una subcategoría explique que la plata va al padre y que a la subcategoría
  // se le pone un tope: eso viaja por clave y parámetros, no por texto.
  //
  // Los dos rechazos del techo (child_over_parent y parent_below_children) se retiraron
  // en §2.4, así que los rechazos de presupuesto que quedan son los que se controlan acá.
  // El nombre viejo del test hablaba de “parámetros numéricos” porque el techo repartido
  // los llevaba; con el techo retirado lo que queda es la forma: clave + params, sin
  // texto.
  const todos = techoC.match(/RAISE EXCEPTION '[^']*'[^;]*;/g) ?? []
  const dePresupuesto = todos.filter((r) => /error_budget_/.test(r))
  assert.equal(dePresupuesto.length, 2, `esperaba dos rechazos de presupuesto, encontré ${dePresupuesto.length} de ${todos.length}`)
  for (const r of dePresupuesto) {
    assert.ok(/"key": "error_budget_/.test(r), 'el rechazo tiene que llevar su clave de error')
    assert.ok(/"params": \{/.test(r), 'el rechazo tiene que llevar sus parámetros')
    // Nada de texto en español: todo va por clave (regla 9 y criterio 14).
    assert.ok(!/[áéíóúñ¿]/.test(r), `el rechazo no puede tener texto hardcodeado: ${r.slice(0, 60)}`)
  }
})

test('la asignación sigue escribiendo en un solo lugar', () => {
  // El patrón se ensancha para las dos formas de nombrar la tabla: el espejo califica
  // (public.p_presupuestos) y las migraciones viejas no. El \b es necesario para no
  // contar el INSERT del historial, que es otra tabla: es el rastro que pide la Etapa 3
  // (§3.7: «los cambios de una categoría, con valor anterior, valor nuevo, fecha y
  // motivo»), no un segundo lugar donde vive el presupuesto.
  const inserts = techoC.match(/INSERT INTO (?:public\.)?p_presupuestos\b/g) ?? []
  assert.equal(inserts.length, 1, 'la función tiene que seguir teniendo un único INSERT en la tabla de presupuestos')
  assert.ok(techoC.includes('ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))'), 'el ON CONFLICT tiene que seguir igual')
  assert.ok(
    /INSERT INTO (?:public\.)?p_presupuestos_historial\b/.test(techoC),
    'el rastro del cambio se escribe aparte, en la tabla de historial (§3.7)',
  )
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
  // después del UPDATE, la transferencia quedaría a medias (criterio 3: «Una
  // transferencia acredita el destino sin descontar el origen»).
  //
  // El patrón se ensancha para las dos formas de nombrar la tabla: el espejo califica
  // (public.p_presupuestos) y las migraciones viejas no. La condición que se afirma es la
  // misma: los rechazos van antes de la primera escritura.
  const mUpdate = /UPDATE (?:public\.)?p_presupuestos SET monto_limite = monto_limite - p_monto/.exec(transC)
  const iUpdate = mUpdate ? mUpdate.index : -1
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
  // El patrón se ensancha para las dos formas de nombrar la tabla. El segundo INSERT no
  // es un paso nuevo: Etapa 1 (§1.1) manda crear la fila del origen con el descuento en
  // negativo «si el origen no tiene línea en el ciclo», y el crédito del destino es el
  // otro paso. La regla se conserva: el débito es una escritura, el crédito es otra, el
  // rastro es aparte, y no hay un cuarto paso sin revisar.
  const updates = transC.match(/UPDATE (?:public\.)?p_presupuestos\b/g) ?? []
  const inserts = transC.match(/INSERT INTO (?:public\.)?p_presupuestos\b/g) ?? []
  const rastro = transC.match(/INSERT INTO (?:public\.)?p_presupuestos_historial\b/g) ?? []
  assert.equal(updates.length, 1, 'el débito del origen con fila existente es un solo UPDATE')
  assert.equal(inserts.length, 2, 'dos INSERT: la línea del origen cuando no existe y el crédito del destino (§1.1)')
  assert.equal(rastro.length, 1, 'las dos patas se registran en un solo INSERT del historial')
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
  // Plan §1.1: «El arrastre es exclusivo de base cero. En libertad no hay arrastre que
  // materializar». Criterio 17: «Aparece un arrastre fuera de base cero».
  //
  // Cambió la forma, no la regla: el disponible del padre ya no se arma sumando el
  // arrastre de sus hijos (§2.1: es la bolsa del grupo) sino con b.bolsa, que sale de
  // fn_disponible_transferible, y es esa función la que apaga el arrastre fuera de base
  // cero. Se comprueban las dos piezas.
  assert.ok(arrC.includes('CASE WHEN e.padre_id IS NOT NULL THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END'),
    'la hoja tiene que seguir tomando su arrastre del balance del mes anterior, que en libertad es cero')
  assert.ok((arrC.match(/v_modo_presupuesto = 'anticipado' THEN 0::numeric/g) ?? []).length >= 3,
    'las expresiones de asignado, disponible, estado y arrastre de las hojas tienen que seguir ignorando el arrastre en libertad')
  assert.ok(
    arrC.includes('public.fn_disponible_transferible(e.estructura_id, v_mes_truncado) AS bolsa'),
    'la bolsa del padre tiene que salir de fn_disponible_transferible, que es la que apaga el arrastre en libertad',
  )
})

test('el disponible del padre incluye el arrastre de sus hijos', () => {
  // Plan §2.1/§2.2: el arrastre de la subcategoría «sube al padre», y el disponible del
  // padre es la bolsa del grupo, que ya lo incluye con su signo y sin piso por fila. La
  // forma vieja (sumar f.arrastre_mes_anterior + presupuesto − gasto) desapareció porque
  // la subcategoría ya no arrastra por su cuenta.
  assert.ok(
    arrC.includes('(b.bolsa + (COALESCE(SUM(f.monto_gastado), 0) + gp.gasto_propio))::numeric'),
    'el arrastre del padre tiene que salir de la bolsa del grupo más lo gastado, con lo gastado en el padre mismo (§2.1)',
  )
  assert.ok(
    !arrC.includes('SUM(f.arrastre_mes_anterior)'),
    'la subcategoría no arrastra por su cuenta: no se suma su arrastre fila por fila (§2.2)',
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
  // T6d: los ids se comparan como números, porque el RPC puede devolver bigint como texto
  // y entonces el Set no encuentra al padre y el hijo queda suelto en la lista.
  assert.ok(bloque.includes('padres.has(Number(s.padre_id))'), 'la comparación padre/hijo tiene que normalizar los ids a número')
  assert.ok(bloque.includes('if (s.padre_id != null && padres.has(Number(s.padre_id))) continue'), 'un hijo de un padre con presupuesto no puede aparecer dos veces')
  // Ronda 8/S1: la lista dejó de ser plana. Cada padre viaja con sus hijas en un
  // bloque, porque el recuadro verde del grupo tiene que envolver a las dos cosas.
  assert.ok(bloque.includes('bloques.push({ cabecera: s, hijas })'), 'los hijos tienen que entrar dentro del bloque de su padre')
  assert.ok(bloque.includes('Number(x.padre_id) === Number(s.estructura_id)'), 'la búsqueda de hijos tiene que normalizar los ids')
  assert.ok(bloque.includes('const hijas = s.es_padre && !estaCerrado(s.estructura_id)'), 'sólo se despliegan los grupos que no están cerrados')
})

test('el monto libre del grupo es la bolsa del padre, CON SU SIGNO', () => {
  // Etapa 3: el margen compartido ya no se calcula con el techo del padre —que en el modelo
  // nuevo no existe— ni restando la plata repartida a los hijos. Es la bolsa del padre: el
  // mismo número que muestra su fila y que usa el validador de transferencias.
  //
  // Cambio de contrato deliberado: el margen ya NO se recorta en cero. El piso hacía que un
  // grupo con el pozo en −326.227 dijera «Sin asignar 0», que se lee «no les queda nada»
  // cuando en realidad falta plata.
  assert.ok(pagina.includes('const libreDe = (padreId: number): number | null =>'), 'falta el cálculo del libre del grupo')
  const bloque = pagina.slice(pagina.indexOf('const libreDe'), pagina.indexOf('const libreDe') + 600)
  assert.ok(bloque.includes('margenCompartidoDeSobre('), 'la bolsa y su signo salen del helper del módulo')
  assert.ok(!bloque.includes('Math.max('), 'el margen compartido no se recorta en cero: el piso escondía el déficit')
  assert.ok(!bloque.includes('monto_asignado ?? 0) -'), 'la regla vieja de restar lo repartido ya no va')
  assert.ok(!bloque.includes('techoDe('), 'el libre no depende de un techo del padre: el padre no lleva techo')
  // El helper es el que lee la bolsa del reporte, y la devuelve tal cual viene.
  const helper = leer('src', 'lib', 'barraSobre.ts')
  const iHelper = helper.indexOf('export function margenCompartidoDeSobre(')
  assert.ok(iHelper > -1, 'falta margenCompartidoDeSobre en el módulo de la barra')
  const cuerpo = helper.slice(iHelper, helper.indexOf('\n}', iHelper))
  assert.ok(cuerpo.includes('monto_disponible'), 'el margen tiene que leer la bolsa del padre')
  assert.ok(!cuerpo.includes('Math.max('), 'sin piso: el déficit del grupo es un dato, no un cero')
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
  // INVERTIDA. Plan §2.4: retirada la validación del techo repartido, ya no hay techo del
  // padre que buscar: el único límite de una asignación es el pozo de base cero, que no
  // depende del padre. Criterio 18: los techos de los hijos no autorizan ni bloquean.
  assert.ok(!bcC.includes('v_techo_padre'), 'la asignación no puede resolver un techo del padre: ese techo ya no existe (§2.4)')
  assert.ok(!bcC.includes('v_repartido'), 'tampoco queda “lo repartido”')
  // El orden que sí importa sigue en pie: el pozo se calcula antes de compararse contra
  // él. En la versión desplegada el cálculo vive DENTRO del guard de base cero, así que
  // el anclaje es ese par y no una asignación suelta en la cabecera.
  const iSaldo = bcC.indexOf('v_saldo_disponible := public.fn_obtener_saldo_a_asignar')
  const iGuard = bcC.indexOf('p_monto_asignado > (v_saldo_disponible')
  assert.ok(iSaldo !== -1, 'no encontré el cálculo del pozo en la asignación')
  assert.ok(iGuard !== -1, 'no encontré la comparación contra el pozo')
  assert.ok(iSaldo < iGuard, 'el pozo tiene que calcularse antes de compararse')
})

test('el guard del pozo se saltea cuando el rubro vive dentro de un techo', () => {
  // INVERTIDA. La exención existía porque el rubro hijo vivía dentro de un techo del
  // padre. §2.4 retira ese techo, así que no hay rubro que pueda quedar exento: el guard
  // del pozo se aplica parejo. Etapa 1.4: lo que se controla es que nadie pueda mover más
  // de lo que tiene, y ese control no se saltea por pertenecer a un grupo.
  assert.ok(
    !bcC.includes('IF COALESCE(v_techo_padre, 0) = 0 AND'),
    'el guard del pozo no puede seguir condicionado al techo del padre',
  )
  // El guard del pozo no usa json_build_object: lleva la clave dentro del JSON literal,
  // con comillas dobles. Por eso se busca el nombre de la clave, sin comillas.
  assert.ok(bcC.includes('error_budget_insufficient_base_zero'), 'el guard del pozo tiene que seguir existiendo, sin exenciones')
})

test('el padre se resuelve una sola vez', () => {
  // §2.4 retiró la lectura del techo del padre, así que la única lectura que queda es la
  // del padre_id. Se conserva la regla original: no puede quedar duplicada.
  assert.equal((bcC.match(/INTO v_padre_id/g) ?? []).length, 1, 'el lookup del padre no puede quedar duplicado')
  assert.equal((bcC.match(/INTO v_techo_padre/g) ?? []).length, 0, 'la lectura del techo del padre se retiró con el techo (§2.4)')
})

test('el techo sigue rechazando después del cambio', () => {
  // INVERTIDA. Las dos validaciones de T3 no se perdieron al mover el lookup: se
  // retiraron, y eso es lo que manda el plan (§2.4 y el anexo de la misma etapa). Lo que
  // queda en su lugar es el rechazo de la subcategoría que intenta tener plata (§1.3), y
  // ese rechazo sigue antes del INSERT.
  assert.ok(
    !bcC.includes('IF p_monto_asignado > (v_techo_padre - v_repartido) THEN'),
    'el rechazo del hijo sobre el techo repartido tiene que estar ausente (§2.4)',
  )
  assert.ok(
    !bcC.includes('IF p_monto_asignado > 0 AND v_repartido > p_monto_asignado THEN'),
    'el rechazo del padre por debajo de lo repartido tiene que estar ausente (§2.4)',
  )
  const iInsert = bcC.indexOf('INSERT INTO public.p_presupuestos')
  const iRechazo = bcC.indexOf('error_budget_child_holds_no_money')
  assert.ok(iInsert > 0 && iRechazo > 0 && iRechazo < iInsert, 'el rechazo de la subcategoría tiene que seguir antes del INSERT')
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
  // INVERTIDA. Plan §2.2: «la bolsa es del padre, que siempre cuenta», y la subcategoría
  // no cuenta nunca. El predicado dejó de depender del presupuesto del padre, así que un
  // padre sin presupuesto no puede esconder ni mostrar a un hijo: los hijos entran
  // siempre, por la fila de su padre.
  assert.ok(
    !visC.includes('AND pp.mes_periodo = v_mes_truncado'),
    'la regla vieja de cuenta_en_totales dependía del presupuesto del padre y se retiró (§2.2)',
  )
  assert.ok(
    !visC.includes('AND COALESCE(pp.monto_limite, 0) > 0'),
    'el hijo no deja de contar por el presupuesto del padre (§2.2)',
  )
  assert.ok(
    visC.includes('(e.padre_id IS NULL) AS cuenta_en_totales'),
    'cuenta el rubro sin padre: el resto entra por la fila del padre',
  )
  assert.ok(
    /\)::numeric, true, true FROM p_estructuras_egresos e/.test(visC),
    'y la fila del padre cuenta siempre, sin mirar su presupuesto',
  )
})

test('la UI arranca con el grupo desplegado', () => {
  // El default es abierto: lo que se persiste es la lista de CERRADOS, así que una
  // lista vacía (primer ingreso, o alguien que nunca cerró nada) deja todo desplegado.
  assert.ok(pagina.includes('const [cerrados, setCerrados] = useState<number[]>(() => leerGruposCerrados())'), 'el estado tiene que arrancar desde lo persistido')
  assert.ok(pagina.includes('const estaCerrado = (id: number) => cerrados.includes(Number(id))'), 'cerrado = el id está en la lista persistida')
  const iHelper = pagina.indexOf('function leerGruposCerrados')
  assert.ok(iHelper > -1, 'falta el lector del almacenamiento')
  assert.ok(pagina.slice(iHelper, iHelper + 400).includes(': []'), 'sin nada guardado la lista es vacía: todo abierto')
  // Y el toggle tiene que actuar sobre el estado EFECTIVO, no sobre el valor crudo:
  // con el default abierto, un «!p[id]» dejaba el primer clic sin efecto.
  assert.ok(!pagina.includes('!p[sobre.estructura_id]'), 'el toggle no puede negar el valor crudo: el primer clic no contraía')
})

test('el rubro en déficit se ve arriba en la alerta y también en su grupo', () => {
  // S5 (ronda 10, dueño): «categorías padres y sub categorías que se muestren tanto
  // arriba como en el déficit, como también dentro de su lugar original».
  // Cambio de contrato deliberado: revierte T6d de la ronda 9, que sacaba el grupo entero
  // de la lista y dejaba las subcategorías escondidas dentro de la alerta.
  const iGrupos = pagina.indexOf('const gruposOrdenados')
  assert.ok(iGrupos > -1, 'falta la agrupación de sobres')
  const finGrupos = pagina.indexOf('HEADER DISPONIBLE', iGrupos)
  const bloqueGrupos = pagina.slice(iGrupos, finGrupos > -1 ? finGrupos : iGrupos + 2000)
  assert.ok(!bloqueGrupos.includes('aLaAlerta'), 'la agrupación ya no puede sacar a nadie de la lista')
  assert.ok(!bloqueGrupos.includes('continue'), 'ningún sobre puede saltearse su grupo')
  // Dueño (2026-11-02): el número de un padre en déficit es la suma de sus hijos, así que
  // la alerta no puede listar a los dos con el mismo monto. El predicado tiene que ser
  // «el padre ESTÁ en la alerta», no «el padre tiene techo»: Transporte no lo tenía y
  // aparecía junto a Combustible con los mismos -780.500.
  const iAlerta = pagina.indexOf('const sobresExcedidos')
  assert.ok(iAlerta > -1, 'falta el cálculo de los sobres en la alerta')
  const bloqueAlerta = pagina.slice(iAlerta, iAlerta + 1400)
  assert.ok(bloqueAlerta.includes('const padresEnAlerta = new Set('), 'la alerta necesita saber qué padres ya muestra')
  assert.ok(bloqueAlerta.includes('s.es_padre && Number(s.monto_disponible) < 0'), 'un padre va a la alerta por su déficit, no por tener techo')
  assert.ok(bloqueAlerta.includes('padresEnAlerta.has(Number(s.padre_id))'), 'el hijo de un padre que ya está en la alerta no se repite')
  assert.ok(!bloqueAlerta.includes('padresConTecho'), 'no puede volver el filtro por techo, que dejaba pasar al hijo')
})

// ---------------------------------------------------------------------------
// Dueño (2026-10-30), tres pedidos sobre la fila del padre y la hoja de asignar:
//   1. el ▶ chiquito parecía un play de audio: ahora es un + grande, que se
//      distingue de abrir el detalle de la categoría
//   2. «SaludLibre del grupo» salía pegado: ahora «Salud (grupal libre)»
//   3. poner 0 no devolvía la plata: ahora deja el sobre en 0 y libera el pozo
// ---------------------------------------------------------------------------

test('el toggle del grupo es un más grande, no un play', () => {
  assert.ok(pagina.includes(">{expandido ? '−' : '+'}</button>"), 'el toggle tiene que mostrar + y −, no ▶')
  const iToggle = pagina.indexOf('sobre-toggle-grupo')
  const bloqueToggle = pagina.slice(iToggle, iToggle + 400)
  assert.ok(!bloqueToggle.includes('▶'), 'el toggle no puede seguir mostrando el play')
  assert.ok(!/\.sobre-toggle-grupo\.abierto\s*\{[^}]*transform/.test(cssPagina), 'el más no rota: rotarlo lo vuelve a parecer un play')
  assert.ok(pagina.includes("aria-label={t(expandido ? 'budget_group_collapse' : 'budget_group_expand')}"), 'el toggle sigue necesitando su etiqueta traducida')
})

test('el grupo ya no anuncia (grupal libre): el rótulo se fue', () => {
  // Ronda 8/S2 (dueño): «Grupal libre lo debes sacar porque no está diciendo nada».
  assert.ok(!pagina.includes("t('budget_group_tag')"), 'la etiqueta (grupal libre) ya no se usa en la fila')
  assert.ok(!pagina.includes('budget_group_free'), 'la etiqueta vieja ya no se usa')
  assert.ok(!pagina.includes('sobre-grupo-etiqueta'), 'el marcado de la etiqueta se fue con ella')
})

test('asignar 0 deja el sobre en cero y devuelve la plata al pozo', () => {
  assert.ok(pagina.includes('if (isNaN(monto) || monto < 0)'), 'ejecutarAsignacion tiene que aceptar 0 y rechazar sólo lo negativo')
  assert.ok(pagina.includes('if (montoAAgregar === 0)'), 'un 0 explícito no se suma: deja el sobre en cero')
  assert.ok(pagina.includes('await ejecutarAsignacion(0)'), 'el 0 tiene que llegar como límite 0, no como 0 + lo asignado')
  assert.ok(pagina.includes('parseMontoInput(montoManual) >= 0'), 'el botón tiene que habilitarse con 0')
})

test('en la base, un padre en 0 no lo frena el guard de los hijos', () => {
  // INVERTIDA. El guard de los hijos ya no existe (§2.4), así que un padre en 0 no puede
  // ser frenado por él en ningún caso. Criterio 18: los techos de los hijos no autorizan
  // ni bloquean. Lo que sigue valiendo es que poner 0 es una operación legítima: deja el
  // sobre en cero y devuelve la plata al pozo.
  assert.ok(
    !bcC.includes('error_budget_parent_below_children'),
    'el guard del padre por debajo de lo repartido se retiró: ya no puede frenar un 0 (§2.4)',
  )
  assert.ok(!bcC.includes('v_repartido'), 'no queda “lo repartido” que pueda frenar un 0')
  // Y el único límite que queda, el pozo de base cero, no mira el padre.
  assert.ok(bcC.includes('IF p_monto_asignado > (v_saldo_disponible + v_monto_previo) THEN'), 'el guard del pozo de base cero tiene que seguir existiendo')
})

// ---------------------------------------------------------------------------
// Dueño: el arrastre positivo de un sobre al mes siguiente tiene que verse en
// verde con el signo más, y el negativo en rojo con el menos. Antes el chip ponía
// un menos fijo y sólo aparecía cuando el arrastre era positivo, así que la plata
// que sobraba se leía como deuda y la deuda real no se veía nunca.
// ---------------------------------------------------------------------------

test('el arrastre muestra el signo que tiene, con su color', () => {
  const i = pagina.indexOf('sobre-arrastre-badge')
  const bloque = pagina.slice(Math.max(i - 500, 0), i + 400)
  assert.ok(bloque.includes('arrastre !== 0'), 'el arrastre negativo también tiene que mostrarse, no sólo el positivo')
  assert.ok(bloque.includes("arrastre > 0 ? 'positivo' : 'negativo'"), 'la clase tiene que salir del signo del arrastre')
  assert.ok(bloque.includes('`+${fmt(arrastre)}`'), 'el arrastre positivo va con más')
  assert.ok(bloque.includes('`-${fmt(Math.abs(arrastre))}`'), 'el negativo va con menos sobre el valor absoluto, sin duplicar el signo')
  assert.ok(cssPagina.includes('.sobre-arrastre-badge.positivo'), 'falta el estilo verde para el arrastre positivo')
})

// ---------------------------------------------------------------------------
// Dueño (2026-11-02): «total del grupo estaría bien». El monto de un rubro padre
// es la suma de lo disponible del grupo (arrastre de los hijos + su techo), no
// plata propia del sobre, así que tiene que ir rotulado.
// ---------------------------------------------------------------------------

test('el monto de un padre se rotula como total del grupo', () => {
  // Ronda 8/S2 (dueño): «total del grupo como título alineado a la derecha abajo de
  // asignar con buena distancia y el valor abajo centrado justo abajo».
  const i = pagina.indexOf('sobre-grupo-total')
  assert.ok(i > -1, 'falta el bloque del total del grupo')
  const bloque = pagina.slice(Math.max(i - 400, 0), i + 500)
  assert.ok(bloque.includes("t('budget_group_total')"), 'falta el rótulo del monto del padre')
  assert.ok(bloque.includes('sobre-grupo-total-titulo'), 'el rótulo es el título del bloque')
  assert.ok(bloque.includes('sobre-grupo-total-valor'), 'el monto va debajo del título')
  assert.ok(bloque.includes('sobre.es_padre ? ('), 'el bloque es sólo para rubros padre')
  const iCss = cssPagina.indexOf('.sobre-grupo-total {')
  assert.ok(iCss > -1, 'falta el estilo del bloque')
  const cssBloque = cssPagina.slice(iCss, iCss + 400)
  assert.ok(cssBloque.includes('margin-left: auto'), 'el bloque tiene que quedar alineado a la derecha')
  assert.ok(cssBloque.includes('align-items: center'), 'el valor va centrado respecto del título')
  for (const [archivo, valor] of [['es.ts', 'Total del grupo'], ['en.ts', 'Group total'], ['pt.ts', 'Total do grupo']]) {
    const texto = leer('src', 'locales', archivo)
    assert.ok(texto.includes(`budget_group_total: "${valor}"`), `falta la traducción en ${archivo}`)
  }
})
