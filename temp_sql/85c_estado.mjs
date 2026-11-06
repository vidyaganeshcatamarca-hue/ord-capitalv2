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
console.log('=== Filas de categoria inversion (¿renombradas?) ===')
const rows = await q(`select e.estructura_id, e.user_id, e.nombre_cuenta, e.tipo_cupo
  from public.p_estructuras_egresos e where COALESCE(e.tipo_cupo,'')='investment'`)
for (const r of rows) console.log(JSON.stringify(r))
console.log('\n=== Indice unico creado? ===')
const idx = await q(`select indexname from pg_indexes where schemaname='public' and indexname='idx_estructuras_inversion_unica'`)
console.log(idx.length ? 'SI: ' + idx[0].indexname : 'NO')
console.log('\n=== Triggers de 83 activos? ===')
const trg = await q(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
  and tgname like 'tr_bloquear%' order by tgname`)
for (const t of trg) console.log('- ' + t.tgname)
console.log('\n=== fn_crear_inversion: usa tipo_cupo? ===')
const d = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_crear_inversion'`)
console.log(d[0]?.def.includes("tipo_cupo = 'investment'") ? 'SI (busca por tipo_cupo)' : 'NO')
