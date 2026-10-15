// Deploy 73: ensayo con rollback primero, luego real; smoke final.
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
const ddl = fs.readFileSync('temp_sql/73_fix_voz_moneda.sql', 'utf8')
console.log('ensayo (rollback)...')
await q(`BEGIN;\n${ddl}\nROLLBACK;`)
console.log('ensayo OK')
console.log('deploy REAL...')
await q(ddl)
console.log('deploy REAL ok')
// smoke: mapa_tarjetas debe exponer moneda_iso (ariel user 198: Ttt = GBP)
const s = await q(`
  BEGIN;
  SELECT set_config('request.jwt.claims', '{"sub":"5e70854e-8cfa-4b0e-946d-64a055cc29c3","role":"authenticated"}', true);
  SELECT json_agg(r) FROM (SELECT tarjeta_id, nombre_tarjeta, moneda_iso FROM fn_reporte_mapa_tarjetas()) r;
  ROLLBACK;`)
console.log('smoke mapa_tarjetas:', JSON.stringify(s))
const c = await q(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'p_caja_cuarentena'::regclass AND conname = 'p_caja_cuarentena_moneda_check'`)
console.log('constraint:', JSON.stringify(c))