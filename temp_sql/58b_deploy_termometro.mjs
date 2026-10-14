// Deploy termómetro redesign: DROP (nueva signature) + CREATE + verificación user 1.
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
const AUTH = 'b90d1f17-f691-491a-a840-522510e67640'

const ddl = "DROP FUNCTION IF EXISTS public.fn_reporte_termometro_tarjeta(bigint);\n" +
  fs.readFileSync('temp_sql/58_termometro_redesign.sql', 'utf8').replace(/\r\n/g, '\n')
await q(ddl)
console.log('deployed ✓')

const run = (card) => q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH}","role":"authenticated"}', true);
SELECT * FROM public.fn_reporte_termometro_tarjeta(${card});
SELECT
  (SELECT COALESCE(SUM(F.monto_local),0) FROM (
     SELECT cd.monto_cuota, cd.moneda, F.monto_local
     FROM p_cuotas_detalle cd
     CROSS JOIN LATERAL fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, 1) F(monto_local)
     WHERE cd.tarjeta_id = ${card} AND cd.pagado = false) F) pendiente_equiv,
  (SELECT max(fecha_estimada_pago) FROM p_cuotas_detalle WHERE tarjeta_id = ${card} AND pagado = false) ultima,
  (SELECT min(fecha_estimada_pago) FROM p_cuotas_detalle WHERE tarjeta_id = ${card} AND pagado = false) primera;
COMMIT;`)
console.log('galicia(2):', JSON.stringify(await run(2)))
console.log('ashram(9):', JSON.stringify(await run(9)))