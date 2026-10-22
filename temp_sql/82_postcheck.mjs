// Postcheck del deploy de la tanda "Inversiones v1 puesta a punto" (T1..T5).
// READ-ONLY: solo verifica que el SQL quedó aplicado y con la firma correcta.
//
// Uso: node temp_sql/82_postcheck.mjs
// Requiere: el deploy ya ejecutado (node temp_sql/82_deploy_real.mjs)
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}

let fallos = 0
const check = (ok, etiqueta, detalle = '') => {
  console.log(`${ok ? '✓' : '✗'} ${etiqueta}${detalle ? ' — ' + detalle : ''}`)
  if (!ok) fallos++
}

const def = async (fn) => {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='${fn}'`)
  return rows[0]?.def || ''
}

// T1: creations conciliated + plazo fijo devenga.
const crear = await def('fn_crear_inversion')
check(crear.includes('ultima_conciliacion'), 'T1 fn_crear_inversion setea ultima_conciliacion')
check(
  crear.includes("CASE WHEN p_tipo_activo = 'plazo_fijo' THEN NULL ELSE p_monto END"),
  'T1 plazo_fijo nace con valor NULL (devengo vivo)',
  'variable sigue naciendo en capital',
)

// T2: cartera + historial.
const cartera = await def('fn_reporte_cartera_inversiones')
check(cartera.includes("i.estado = 'activa'"), 'T2 cartera filtra estado=activa')
check(cartera.includes('monto_liquidado'), 'T2 cartera trae monto_liquidado')
const historial = await def('fn_reporte_historial_inversiones')
check(historial.includes('moneda'), 'T2 historial trae moneda')

// T3: contratos multimoneda.
const patrimonio = await def('fn_reporte_patrimonio_inversiones')
check(patrimonio.includes('RETURNS jsonb'), 'T3 patrimonio devuelve jsonb')
check(!patrimonio.includes('p_cotizacion_usd'), 'T3 patrimonio ya NO expone p_cotizacion_usd')
check(patrimonio.includes('total_moneda_local'), 'T3 patrimonio trae total_moneda_local')
check(patrimonio.includes('monedas_sin_cotizacion'), 'T3 patrimonio trae monedas_sin_cotizacion')
check(patrimonio.includes('fn_valor_a_moneda_local'), 'T3 patrimonio convierte con el pivote real')
const rendimiento = await def('fn_reporte_rendimiento_vs_inflacion')
check(rendimiento.includes('fn_valor_a_moneda_local'), 'T3 rendimiento convierte a moneda local')
const dist = await def('fn_reporte_distribucion_activos')
check(dist.includes('fn_valor_a_moneda_local'), 'T3 distribución convierte a moneda local')
check(dist.includes('moneda_local'), 'T3 distribución trae moneda_local')

// T4: liquidación sin doble conteo.
const liquidar = await def('fn_liquidar_inversion')
check(
  liquidar.includes('v_por_acentrar := p_monto_total_retirado - v_ya_retirado'),
  'T4 liquidación descuenta lo ya retirado',
)
check(
  liquidar.includes('v_ya_retirado := COALESCE(v_inversion.monto_liquidado, 0)'),
  'T4 liquidación lee el monto liquidado',
)

// T5: config de inflación legible.
const config = await def('fn_obtener_config_inflacion')
check(config.includes('RETURNS jsonb'), 'T5 fn_obtener_config_inflacion existe y devuelve jsonb')
check(config.includes('configurado'), 'T5 informa si hay config guardada')

console.log(fallos === 0 ? '\nOK: las 8 funciones quedaron como la tanda las pide.' : `\nFALLOS: ${fallos}`)
process.exit(fallos === 0 ? 0 : 1)
