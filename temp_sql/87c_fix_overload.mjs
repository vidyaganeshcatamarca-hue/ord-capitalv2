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
// El overload viejo (2 params) es el que aceptaba 'api_automatica' y no
// soporta la fuente manual: se elimina para que quede UNA sola firma.
const r = await q(`drop function if exists public.fn_configurar_inflacion(text, text)`)
console.log(r.error ? 'ERROR: ' + r.error : 'drop del overload viejo: OK')
const check = await q(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_configurar_inflacion'`)
for (const c of check) console.log('FIRMA:', c.sig, '| manual:', c.def.includes('p_inflacion_manual_anual_pct'))
