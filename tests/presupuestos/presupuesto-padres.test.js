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
const sumas = leer('temp_sql', '153_sumas_sin_padres.sql')

// Comparar SQL sin depender de la indentación.
const compacto = (s) => s.replace(/\s+/g, ' ').trim()
const reporteC = compacto(reporte)
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
