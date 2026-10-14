// Genera temp_sql/70_multimoneda_local.sql desde los dumps live:
// reemplaza el literal 'ARS' = "moneda local del usuario" por la moneda resuelta.
import fs from 'node:fs'

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const w = fs.writeFileSync
const S = 'temp_sql/_live/'

let out = ''
// helper SQL a insertar tras resolver v_user_id
const LOCAL_SET = (varUser = 'v_user_id') => `
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = ${varUser}), 'ARS') INTO v_moneda_local;`

function patch(name, file, work, note) {
  let def = read(file)
  for (const { from, to, once = true } of work) {
    if (!def.includes(from)) throw new Error(`${name}: no hallé "${from.slice(0, 60)}"`)
    def = once ? def.replace(from, to) : def.replace(from, to)
  }
  out += `\n-- ============ ${name} ============\n-- ${note}\nDROP FUNCTION IF EXISTS ${signatura(name)};\n`
  w(`temp_sql/_live/patch70_${name}.sql`, def)
  return def
}

// firmas para DROP (con defaults explicitos donde existen)
function signatura(name) {
  const sigs = {
    fn_crear_tarjeta_credito: 'public.fn_crear_tarjeta_credito(text, text, integer, integer, numeric, numeric, text)',
    fn_registrar_gasto_tarjeta: 'public.fn_registrar_gasto_tarjeta', // resuelto aparte
    fn_reporte_vencimientos_tarjetas: 'public.fn_reporte_vencimientos_tarjetas()',
    fn_reporte_mapa_tarjetas: 'public.fn_reporte_mapa_tarjetas()',
    fn_registrar_pago_tarjeta_multi: 'public.fn_registrar_pago_tarjeta_multi',
    fn_liquidar_ciclo_tarjeta_multi: 'public.fn_liquidar_ciclo_tarjeta_multi',
    fn_reporte_patrimonio_neto_consolidado: 'public.fn_reporte_patrimonio_neto_consolidado',
    fn_cargar_movimientos_voz: 'public.fn_cargar_movimientos_voz',
    fn_registrar_movimiento_caja: 'public.fn_registrar_movimiento_caja',
    fn_gestionar_deuda: 'public.fn_gestionar_deuda',
  }
  return sigs[name]
}

// 1. crear tarjeta: INSERT suma moneda_iso = local
let d = read(S + 'p70_fn_crear_tarjeta_credito.sql')
if (!d.includes('INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, color, limite_un_pago, limite_cuotas, recargo_dolar_pct)')) throw new Error('crear_tarjeta insert no match')
d = d.replace(
  'INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, color, limite_un_pago, limite_cuotas, recargo_dolar_pct)',
  'INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, color, limite_un_pago, limite_cuotas, recargo_dolar_pct, moneda_iso)'
)
// la linea del VALUES correspondiente: (v_user_id, ..., p_recargo_dolar_pct)
d = d.replace(
  /VALUES \(v_user_id, p_nombre_tarjeta, p_banco, p_dia_vencimiento, p_dia_cierre, p_color, p_limite_un_pago, p_limite_cuotas, p_recargo_dolar_pct\)/,
  `VALUES (v_user_id, p_nombre_tarjeta, p_banco, p_dia_vencimiento, p_dia_cierre, p_color, p_limite_un_pago, p_limite_cuotas, p_recargo_dolar_pct, COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS'))`
)
w('temp_sql/_live/patch70_fn_crear_tarjeta_credito.sql', d)

// 2. registrar gasto tarjeta: moneda = tarjeta (fallback local); recargo 0
d = read(S + 'p70_fn_registrar_gasto_tarjeta.sql'.replace('p70_', 'sweep_'))
d = d.replace("    v_recargo_dolar_pct numeric;", "    v_recargo_dolar_pct numeric;\n    v_moneda_tarjeta text;\n    v_moneda_local text;")
d = d.replace("SELECT dia_cierre, dia_vencimiento, COALESCE(recargo_dolar_pct, 30.00)", "SELECT dia_cierre, dia_vencimiento, COALESCE(recargo_dolar_pct, 0.00), moneda_iso")
d = d.replace(/INTO v_dia_cierre, v_dia_vencimiento, v_recargo_dolar_pct/, "INTO v_dia_cierre, v_dia_vencimiento, v_recargo_dolar_pct, v_moneda_tarjeta")
d = d.replace("        v_moneda := 'ARS';\n    END IF;", `        v_moneda := COALESCE(v_moneda_tarjeta, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = v_user_id), 'ARS');\n    END IF;`)
w('temp_sql/_live/patch70_fn_registrar_gasto_tarjeta.sql', d)

// 3. vencimientos: buckets ARS -> local
d = read(S + 'sweep_fn_reporte_vencimientos_tarjetas.sql')
d = d.replace("    v_estado text;", "    v_estado text;\n    v_moneda_local text;")
d = d.replace(/IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;/, `$&${LOCAL_SET()}`)
d = d.replace(/CASE WHEN cd\.moneda = 'ARS'/g, "CASE WHEN cd.moneda = v_moneda_local")
w('temp_sql/_live/patch70_fn_reporte_vencimientos_tarjetas.sql', d)

// 4. mapa: igual
d = read(S + 'sweep_fn_reporte_mapa_tarjetas.sql')
d = d.replace("    v_consumo_un_pago_ars numeric;", "    v_consumo_un_pago_ars numeric;\n    v_moneda_local text;")
d = d.replace(/IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;/, `$&${LOCAL_SET()}`)
d = d.replace(/CASE WHEN cd\.moneda = 'ARS'/g, "CASE WHEN cd.moneda = v_moneda_local")
w('temp_sql/_live/patch70_fn_reporte_mapa_tarjetas.sql', d)

// 5. pago multi: whitelists y compares
d = read(S + 'sweep_fn_registrar_pago_tarjeta_multi.sql')
d = d.replace("    v_moneda_pago text;", "    v_moneda_pago text;\n    v_moneda_local text;")
d = d.replace(/IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;/, `$&${LOCAL_SET()}`)
d = d.replace("v_moneda_pago NOT IN ('ARS', 'USD')", "v_moneda_pago NOT IN (v_moneda_local, 'USD')")
d = d.replace("v_moneda_target NOT IN ('ARS', 'USD')", "v_moneda_target NOT IN (v_moneda_local, 'USD')")
d = d.replace("IF v_moneda_pago = 'ARS' AND v_moneda_target = 'USD' THEN", "IF v_moneda_pago = v_moneda_local AND v_moneda_target = 'USD' THEN")
d = d.replace("ELSIF v_moneda_pago = 'USD' AND v_moneda_target = 'ARS' THEN", "ELSIF v_moneda_pago = 'USD' AND v_moneda_target = v_moneda_local THEN")
d = d.replace("IF v_moneda_pago = 'ARS' THEN", "IF v_moneda_pago = v_moneda_local THEN")
d = d.replace("CASE WHEN moneda = 'ARS' THEN monto_cuota ELSE 0 END", "CASE WHEN moneda = v_moneda_local THEN monto_cuota ELSE 0 END")
d = d.replace("v_moneda_pago := 'ARS';", "v_moneda_pago := v_moneda_local;")
d = d.replace("(elem->>'moneda_target') = 'ARS'", "(elem->>'moneda_target') = v_moneda_local")
w('temp_sql/_live/patch70_fn_registrar_pago_tarjeta_multi.sql', d)

// 6. liquidar multi: target/moneda/local + refinanciado
d = read(S + 'sweep_fn_liquidar_ciclo_tarjeta_multi.sql')
const hasLocal = d.includes('v_moneda_local')
d = d.replace("DECLARE\n", "DECLARE\n    v_moneda_local text;\n", 1)
if (!hasLocal) d = d.replace(/p_user_id/, 'p_user_id') // el local se setea con p_user_id: insert despues del primer BEGIN/DECLARE... buscar set point
// set: buscar el primer punto tras el que ya resolvio alguna tarjeta/usuario. Insert al inicio del bloque principal:
if (!d.includes('SELECT COALESCE((SELECT moneda_default')) {
  // tras la declaracion de variables, al empezar el BODY: usar el primer IF de validacion de p_user_id
  d = d.replace(/(IF p_user_id IS NULL[^\n]*\n)/, `$1${LOCAL_SET('p_user_id')}\n`)
  if (!d.includes('SELECT COALESCE((SELECT moneda_default')) {
    // fallback: luego del gate fn_get_user_id / auth gate: insertar antes del primer SELECT INTO grande
    d = d.replace(/(BEGIN\s*\n)/, `$1${LOCAL_SET('p_user_id')}\n`)
  }
}
d = d.replace("(elem->>'moneda_target') = 'ARS'", "(elem->>'moneda_target') = v_moneda_local")
d = d.replace("IF r_cuota.moneda = 'ARS' THEN", "IF r_cuota.moneda = v_moneda_local THEN")
d = d.replace(/VALUES \(p_user_id, p_tarjeta_id, 1, v_refinanciado_ars, 'ARS', v_prox_vencimiento, false\)/, "VALUES (p_user_id, p_tarjeta_id, 1, v_refinanciado_ars, v_moneda_local, v_prox_vencimiento, false)")
d = d.replace("(elem->>'moneda_origen') = 'ARS'", "(elem->>'moneda_origen') = v_moneda_local")
if (!d.includes('v_moneda_local')) throw new Error('liquidar: no se inserto local')
w('temp_sql/_live/patch70_fn_liquidar_ciclo_tarjeta_multi.sql', d)

// 7. voz: whitelist de moneda declarada (local | USD)
d = read(S + 'sweep_fn_cargar_movimientos_voz.sql')
const vozDecl = d.includes('v_moneda_local')
if (!vozDecl) d = d.replace("DECLARE\n", "DECLARE\n    v_moneda_local text;\n", 1)
d = d.replace(/(IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;)/, `$1${LOCAL_SET()}`)
d = d.replace("v_currency NOT IN ('ARS', 'USD')", "v_currency NOT IN (v_moneda_local, 'USD')")
if (!d.includes('v_moneda_local')) throw new Error('voz: no local')
w('temp_sql/_live/patch70_fn_cargar_movimientos_voz.sql', d)

// 8. registrar_movimiento_caja: titulos compra/venta con local
d = read(S + 'p70_fn_registrar_movimiento_caja.sql')
d = d.replace("DECLARE\n", "DECLARE\n    v_moneda_local text;\n", 1)
d = d.replace(/(IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;)/, `$1${LOCAL_SET()}`)
d = d.replace("v_destino.moneda = 'USD' AND v_origen.moneda = 'ARS' THEN 'transfer_compra_dolares'", "v_destino.moneda = 'USD' AND v_origen.moneda = v_moneda_local THEN 'transfer_compra_dolares'")
d = d.replace("WHEN v_origen.moneda = 'USD' THEN 'transfer_venta_dolares'", "WHEN v_origen.moneda = 'USD' AND v_destino.moneda = v_moneda_local THEN 'transfer_venta_dolares'")
w('temp_sql/_live/patch70_fn_registrar_movimiento_caja.sql', d)

// 9. deuda: default NULL + COALESCE local
d = read(S + 'p70_fn_gestionar_deuda.sql')
d = d.replace("p_moneda_iso text DEFAULT 'ARS'::text)", "p_moneda_iso text DEFAULT NULL::text)")
d = d.replace("COALESCE(p_moneda_iso, 'ARS')", "COALESCE(p_moneda_iso, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = (SELECT user_id FROM public.usuarios WHERE auth_id = auth.uid())), 'ARS')")
w('temp_sql/_live/patch70_fn_gestionar_deuda.sql', d)

// 10. patrimonio consolidado: buckets locales
d = read(S + 'p70_fn_reporte_patrimonio_neto_consolidado.sql')
const declOk = d.includes('v_moneda_local')
if (!declOk) d = d.replace("DECLARE\n", "DECLARE\n    v_moneda_local text;\n", 1)
// ya define v_moneda_local? el archivo usa COALESCE(v_moneda_local,'USD') -> existe; el set debe estar ANTES del uso; si ya existe, dejar
if (!d.match(/SELECT\s+COALESCE[\s\S]*?moneda_default[\s\S]*?INTO v_moneda_local/)) {
  d = d.replace(/(IF v_user_id IS NULL THEN RAISE EXCEPTION '[^']*'; END IF;)/, `$1${LOCAL_SET()}`)
}
d = d.replace(/CASE WHEN moneda = 'ARS' THEN/g, "CASE WHEN moneda = v_moneda_local THEN")
w('temp_sql/_live/patch70_fn_reporte_patrimonio_neto_consolidado.sql', d)

// ensamblar deploy
const names = ['fn_reporte_vencimientos_tarjetas()', 'fn_reporte_mapa_tarjetas()']
const sigByPatch = {
  'patch70_fn_crear_tarjeta_credito.sql': 'public.fn_crear_tarjeta_credito(text, text, integer, integer, numeric, numeric, text)',
  'patch70_fn_registrar_gasto_tarjeta.sql': null,
  'patch70_fn_reporte_vencimientos_tarjetas.sql': 'public.fn_reporte_vencimientos_tarjetas()',
  'patch70_fn_reporte_mapa_tarjetas.sql': 'public.fn_reporte_mapa_tarjetas()',
  'patch70_fn_registrar_pago_tarjeta_multi.sql': null,
  'patch70_fn_liquidar_ciclo_tarjeta_multi.sql': null,
  'patch70_fn_cargar_movimientos_voz.sql': null,
  'patch70_fn_registrar_movimiento_caja.sql': null,
  'patch70_fn_gestionar_deuda.sql': null,
  'patch70_fn_reporte_patrimonio_neto_consolidado.sql': null,
}
let deploy = ''
for (const [file, sig] of Object.entries(sigByPatch)) {
  const body = read(S + file)
  const fnName = file.replace('patch70_', '').replace('.sql', '')
  const dump = fs.readdirSync(S).find(f => f.includes(fnName) && f.startsWith('sweep_')) ?? `p70_${fnName}.sql`
  const dFull = read(S + dump)
  const sigMatch = dFull.match(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\)\s*\n RETURNS/)
  let dropLine = ''
  if (sig) dropLine = `DROP FUNCTION IF EXISTS ${sig};\n`
  else if (sigMatch) {
    const args = sigMatch[2]
    let types = []
    if (args.trim()) types = args.split(',').map(a => (a.trim().split(/\s+/)[0] ?? '').replace(/::{1,2}/g, '::'))
    dropLine = `DROP FUNCTION IF EXISTS public.${sigMatch[1]}(${sigMatch[2]});\n`.
      replace(/(IN|OUT|INOUT|VARIADIC)\s+/gi, '').replace(/DEFAULT[^,)]*(,|\))/g, (m) => m.trim().startsWith('DEFAULT') ? (m.includes(',') ? ',' : ')') : m).replace(/::text DEFAULT NULL/ig, '')
  }
  deploy += `\n\n${dropLine}\n${body}`
}
w('temp_sql/70_deploy_tmp.sql', deploy)
console.log('patches generados:', Object.keys(sigByPatch).length)
console.log('DROP de gasto_tarjeta / pago / liquidar / voz / mov_caja / deuda / consolidado: revisar firma manualmente en deploy final')