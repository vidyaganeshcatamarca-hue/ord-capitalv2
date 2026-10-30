// tests/presupuestos/patas-de-transferencia.test.js
//
//   node --test tests/presupuestos/patas-de-transferencia.test.js
//
// Dueño: "explicame como es posible que haya gastos sin detalle, sin categoria de
// salida, algo esta mal ahi" y despues "Vista única, y los reportes leen de ahí".
//
// Comprar o vender dolares no entra en una sola fila de p_caja: la tabla tiene una
// sola columna moneda y el trigger fn_actualizar_saldo_billetera_integral rechaza
// tipo='transfer' cuando origen y destino tienen monedas distintas. El escritor
// parte el movimiento en dos filas (expense en pesos + income en dolares) y las une
// con metadata.transfer_double_insert = true.
//
// Esas dos filas son una conversion de moneda, no un gasto ni un ingreso. Trece
// reportes las sumaban: septiembre 2026 del usuario 1 daba 6.992.641,32 de gasto
// cuando el real era 6.262.323,79.
//
// Lo que se congela:
//   1. La regla vive en un solo lugar: la vista v_p_caja_reportable excluye las patas
//      por metadata.transfer_double_insert.
//   2. Toda funcion que el reporte usa lee de la vista y no de p_caja.
//   3. Los dos reportes que ya estaban bien (el donut y el feed) no se tocan: el feed
//      necesita las dos filas para mostrar la transferencia.
//   4. Ninguna de las funciones repuntadas escribe en p_caja: el cambio es de lectura,
//      asi que no puede mover un saldo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')

const migracion136 = leer('temp_sql', '136_vista_reportable.sql')
const migracion140 = leer('temp_sql', '140_reportes_restantes.sql')
const migraciones = migracion136 + '\n' + migracion140

// Las funciones que quedaron leyendo la vista, por nombre, tal como las nombra el
// dueno del dato: si una migracion futura repunta una, tiene que estar aca.
const REPUNTADAS = [
  'fn_reporte_resumen_cuadrantes',
  'fn_reporte_reto_buzon_deseos',
  'fn_reporte_reto_hormigas',
  'fn_reporte_safe_to_spend',
  'fn_reporte_simulador_escenarios',
  'fn_reporte_simulador_impacto',
  'fn_reporte_sobres_detalle',
  'fn_reporte_termometro_presupuestos',
  'fn_reporte_termometro_tarjeta',
  'fn_reporte_timeline_proyeccion',
  'fn_reporte_variacion_intermensual',
  'fn_sugerir_distribucion_activacion',
  'fn_telemetry_refresh_user_metrics',
  'fn_transferir_entre_sobres',
  'fn_obtener_saldo_disponible_para_asignar',
  'fn_obtener_techo_presupuestario',
  'fn_reporte_escudo_tiempo',
  'fn_reporte_evolucion_presupuesto',
  'fn_reporte_limite_seguro_deuda',
  'fn_reporte_proyeccion_presupuestaria',
  'fn_reporte_gasto_por_integrante',
  'fn_reporte_punto_equilibrio',
  'fn_reporte_top_fuentes_ingreso'
]

// El feed arma la transferencia con las dos filas; si leyera la vista no tendría con
// qué mostrarla. El donut llega al mismo número por el INNER JOIN con los rubros.
const NO_SE_TOCAN = ['fn_reporte_movimientos_recientes', 'fn_reporte_top_categorias_mes']

const definiciones = (sql) => {
  const out = new Map()
  const re = /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\s*\(/gi
  let m
  while ((m = re.exec(sql))) {
    const desde = m.index
    const siguiente = sql.slice(desde + 10).search(/CREATE OR REPLACE FUNCTION public\./i)
    const hasta = siguiente === -1 ? sql.length : desde + 10 + siguiente
    out.set(m[1] + '@' + desde, sql.slice(desde, hasta))
  }
  return [...out.entries()]
}

test('la vista excluye las patas por el marcador de la metadata', () => {
  const vista = migracion136.slice(
    migracion136.indexOf('CREATE OR REPLACE VIEW'),
    migracion136.indexOf('COMMENT ON VIEW')
  )
  assert.match(vista, /FROM public\.p_caja/)
  assert.match(vista, /metadata->>'transfer_double_insert'/)
  assert.match(vista, /<> 'true'/, 'la condicion tiene que dejar afuera las patas')
  assert.match(vista, /security_invoker = true/, 'la vista tiene que respetar el RLS de quien consulta')
  assert.match(migracion136, /GRANT SELECT ON public\.v_p_caja_reportable TO authenticated/)
})

test('cada funcion repuntada lee de la vista y ninguna quedo mirando p_caja', () => {
  const cuerpos = definiciones(migraciones)
  const porNombre = new Map()
  for (const [, cuerpo] of cuerpos) {
    const nombre = cuerpo.match(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/i)[1]
    porNombre.set(nombre, cuerpo)
  }
  for (const nombre of REPUNTADAS) {
    const cuerpo = porNombre.get(nombre)
    assert.ok(cuerpo, `falta la definicion de ${nombre} en las migraciones`)
    assert.match(cuerpo, /v_p_caja_reportable/, `${nombre} tiene que leer de la vista`)
    const restos = cuerpo.match(/\bp_caja\b/g) || []
    assert.equal(restos.length, 0, `${nombre} todavia lee p_caja ${restos.length} vez/veces`)
  }
})

test('las que ya estaban bien no se tocan', () => {
  for (const nombre of NO_SE_TOCAN) {
    assert.doesNotMatch(migraciones, new RegExp(`FUNCTION public\\.${nombre}\\s*\\(`, 'i'),
      `${nombre} no debe redefinirse: ya trataba bien las patas`)
  }
})

test('el cambio es solo de lectura: ninguna definicion escribe en p_caja', () => {
  for (const [clave, cuerpo] of definiciones(migraciones)) {
    assert.doesNotMatch(cuerpo, /INSERT\s+INTO\s+(public\.)?v_p_caja_reportable/i,
      `${clave}: no se escribe en la vista`)
    assert.doesNotMatch(cuerpo, /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?p_caja\b/i,
      `${clave}: una definicion repuntada no puede escribir en p_caja`)
  }
})
