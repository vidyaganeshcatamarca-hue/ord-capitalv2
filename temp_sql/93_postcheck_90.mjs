// Postcheck del deploy 90: firmas, permisos, overloads y comportamiento real.
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 600))
  return json
}

let fallos = 0
const check = (ok, etiqueta, detalle = '') => {
  console.log(`${ok ? '✓' : '✗'} ${etiqueta}${detalle ? ' — ' + detalle : ''}`)
  if (!ok) fallos++
}

// 1) Las 7 funciones existen, una sola versión de cada una.
const esperadas = [
  'fn_inflacion_vigente',
  'fn_reporte_rendimiento_vs_inflacion',
  'fn_reporte_detalle_inversion',
  'fn_reporte_cartera_inversiones',
  'fn_reporte_historial_inversiones',
  'fn_obtener_config_inflacion',
  'fn_liquidar_inversion',
]
const firmas = await q(`select p.proname as fn, count(*)::int as versiones
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname in (${esperadas.map((f) => `'${f}'`).join(',')})
  group by p.proname order by p.proname`)
for (const f of esperadas) {
  const fila = firmas.find((x) => x.fn === f)
  check(fila && fila.versiones === 1, `${f} existe y hay una sola versión`, fila ? `${fila.versiones}` : 'no existe')
}

// 2) El helper interno no es ejecutable por el cliente.
const permisos = await q(`select has_function_privilege('anon', 'public.fn_inflacion_vigente(bigint)', 'EXECUTE') as anon,
                                  has_function_privilege('authenticated', 'public.fn_inflacion_vigente(bigint)', 'EXECUTE') as auth`)
check(permisos[0].anon === false, 'anon NO puede ejecutar fn_inflacion_vigente')
check(permisos[0].auth === false, 'authenticated NO puede ejecutar fn_inflacion_vigente')

// 3) Comportamiento real de la inflación.
const infl = await q(`select
   public.fn_inflacion_vigente(1)   as u1,
   public.fn_inflacion_vigente(198) as u198`)
const u1 = infl[0].u1
const u198 = infl[0].u198
check(u1.moneda_local === 'ARS', 'usuario 1 usa la moneda de su región (ARS)', u1.moneda_local)
check(u1.motivo === 'ok' && u1.disponible === true, 'usuario 1 tiene inflación disponible', `${u1.inflacion_6m}% en ${u1.ventana_6m_meses} meses`)
check(u1.pais === 'AR', 'usuario 1 usa el país regional (AR), no el guardado (US)', u1.pais)
check(u198.moneda_local === 'GBP', 'usuario 198 usa GBP', u198.moneda_local)
check(u198.motivo === 'sin_datos', 'usuario 198 informa falta de datos (no pide configurar)', u198.motivo)

// 4) El rendimiento del detalle expone lo retirado y la cartera lo suma.
const det = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_detalle_inversion'`)
check(det[0].def.includes("'monto_liquidado'"), 'el detalle devuelve monto_liquidado')

const cartera = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_cartera_inversiones'`)
check(cartera[0].def.includes('COALESCE(i.monto_liquidado, 0)'), 'la cartera suma lo retirado al nominal')

// 5) El guard de moneda está antes del primer INSERT.
const liq = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_liquidar_inversion'`)
const def = liq[0].def
check(def.includes('error_wallet_currency_mismatch'), 'liquidar valida la moneda de la billetera destino')
check(def.indexOf('error_wallet_currency_mismatch') < def.indexOf('INSERT INTO p_caja'), 'el guard va antes de acreditar')

// 6) La configuración guardada ya no manda sobre el cálculo.
const obten = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_obtener_config_inflacion'`)
check(obten[0].def.includes('fn_inflacion_vigente'), 'el tab de inflación lee el cálculo vivo')

console.log(fallos === 0 ? '\nOK: todo el deploy quedó como se esperaba.' : `\n${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
