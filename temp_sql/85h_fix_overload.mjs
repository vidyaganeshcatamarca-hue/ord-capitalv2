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
// El overload viejo (con p_cotizacion_usd) queda huerfano tras el cambio de
// contrato: se elimina para que la funcion tenga una sola firma.
const r = await q(`drop function if exists public.fn_reporte_patrimonio_inversiones(numeric)`)
console.log(r.error ? 'ERROR: ' + r.error : 'drop del overload viejo: OK')
const check = await q(`select p.oid::regprocedure::text as sig from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_patrimonio_inversiones'`)
console.log('firmas restantes:', JSON.stringify(check))
