import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}
const SCRIPTS = [
  'temp_sql/86_inversiones_saldo_e_inflacion_manual.sql',
  'temp_sql/86b_saldo_y_cascada.sql',
]
console.log('Deploy REAL 86 + 86b — autorizado por el dueño 2026-10-21')
for (const s of SCRIPTS) {
  const ddl = fs.readFileSync(s, 'utf-8')
  console.log(`-> ${s} (${ddl.split('\n').length} lineas)`)
  await q(ddl)
  console.log('   OK')
}
console.log('\n=== Verificacion ===')
const checks = [
  ['fn_configurar_inflacion', /p_inflacion_manual_anual_pct/],
  ['fn_obtener_config_inflacion', /inflacion_manual_anual_pct/],
  ['fn_reporte_detalle_inversion', /inflacion_disponible/],
]
for (const [fn, rx] of checks) {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`)
  const ok = rows[0] && rx.test(rows[0].def)
  console.log(`${ok ? '✓' : '✗'} ${fn}`)
}
const trg = await q(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
  and tgname in ('tr_validar_saldo_inversion','tr_anular_inversion_al_borrar_movimiento') order by tgname`)
for (const t of trg) console.log(`✓ trigger ${t.tgname}`)
const col = await q(`select column_name from information_schema.columns
  where table_schema='public' and table_name='p_config_inflacion' and column_name='p_inflacion_manual_anual_pct'`)
console.log(col.length ? '✓ columna p_inflacion_manual_anual_pct' : '✗ falta la columna')
