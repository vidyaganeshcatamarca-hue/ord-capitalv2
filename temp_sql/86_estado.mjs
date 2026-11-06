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
  if (!res.ok) return { error: json.message || JSON.stringify(json) }
  return json
}
console.log('=== fn_obtener_config_inflacion existe? (el error de la captura) ===')
const f = await q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_obtener_config_inflacion'`)
console.log(f.length ? 'SI: ' + JSON.stringify(f) : 'NO EXISTE (la captura es anterior al deploy)')
console.log('\n=== fn_configurar_inflacion: firma actual ===')
const c = await q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_configurar_inflacion'`)
console.log(JSON.stringify(c))
console.log('\n=== Saldos del usuario 198 ===')
const s = await q(`select b.billetera_id, b.nombre, b.moneda, b.saldo_actual from public.p_billeteras b
  where b.user_id=198 order by b.billetera_id`)
for (const r of s) console.log(JSON.stringify(r))
console.log('\n=== p_config_inflacion del usuario 198 ===')
const ci = await q(`select * from public.p_config_inflacion where user_id=198`)
console.log(JSON.stringify(ci))
