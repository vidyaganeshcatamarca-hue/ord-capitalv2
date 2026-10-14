// Dump live de fn_aprobar_cuarentena_v2 y diff contra el espejo
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json
}
const rows = await q(`SELECT pg_get_functiondef(p.oid) def, p.oid, p.proargtypes::text
FROM pg_proc p WHERE p.proname = 'fn_aprobar_cuarentena_v2'`)
for (const r of rows) {
  const fname = `temp_sql/_live/fn_aprobar_cuarentena_v2_${r.oid}.sql`
  fs.writeFileSync(fname, r.def)
  console.log('oid', r.oid, 'proargtypes', r.proargtypes, '->', fname)
}
// espejo actual (saca el cuerpo entre AS $function$ ... $function$)
const mirror = fs.readFileSync('funcionesSQL/fn_aprobar_cuarentena_v2.md', 'utf8')
const m = mirror.match(/AS \$function\$([\s\S]*?)\$function\$/)
// el dump trae CREATE FUNCTION completo con AS $function$ cuerpo $function$;
const def = rows[0].def
const d = def.match(/AS \$function\$([\s\S]*?)\$function\$/)
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '')
console.log('cuerpo igual al espejo:', norm(m[1]) === norm(d[1]))