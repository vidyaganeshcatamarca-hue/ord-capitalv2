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
// 1. Default de columna + datos existentes a 0 (funcion muerta, orden del dueño)
const migr = `
ALTER TABLE public.p_tarjetas_credito
  ALTER COLUMN recargo_dolar_pct SET DEFAULT 0.00;
UPDATE public.p_tarjetas_credito SET recargo_dolar_pct = 0.00;
SELECT recargo_dolar_pct, count(*) FROM public.p_tarjetas_credito GROUP BY recargo_dolar_pct;`
console.log('migracion recargo:', JSON.stringify(await q(migr)))

// 2. mapa RPC: COALESCE(...,30.00) -> 0 (DROP + CREATE desde el espejo live)
const rows = await q(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p WHERE p.proname='fn_reporte_mapa_tarjetas'`)
let def = rows[0].def.replace(/\r\n/g, '\n')
fs.writeFileSync('temp_sql/_live/fn_reporte_mapa_tarjetas.sql', def)
if (!def.includes('COALESCE(r_tarjeta.recargo_dolar_pct, 30.00)')) throw new Error('coalesce 30 no encontrado')
def = def.replace(/COALESCE\(r_tarjeta\.recargo_dolar_pct, 30\.00\)/g, 'COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)')
fs.writeFileSync('temp_sql/68_mapa_recargo_cero.sql', def)
await q(`DROP FUNCTION IF EXISTS public.fn_reporte_mapa_tarjetas();` + def)
console.log('mapa redeploy ok')
// verificacion
console.log(JSON.stringify(await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);
SELECT recargo_dolar_pct FROM fn_reporte_mapa_tarjetas();
COMMIT;`)))