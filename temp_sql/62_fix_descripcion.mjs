// Parche fn_reporte_compromisos_tarjeta: descripcion = cuenta historica > detalle > categoria.
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
const rows = await q(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p WHERE p.proname='fn_reporte_compromisos_tarjeta'`)
let def = rows[0].def.replace(/\r\n/g, '\n')
fs.writeFileSync('temp_sql/_live/fn_reporte_compromisos_tarjeta.sql', def)

const viejo = `        cx.nombre_cuenta_historico::text AS descripcion,`
const nuevo = `        -- La compra por voz solo guarda categoria (estructura) y a veces
        -- detalle; el nombre de categoria es data del movimiento.
        COALESCE(cx.nombre_cuenta_historico, cx.detalle, eg.nombre_cuenta)::text AS descripcion,`
if (!def.includes(viejo)) throw new Error('descripcion line not found')
def = def.replace(viejo, nuevo)

const joinViejo = `    FROM p_cuotas_detalle c
    LEFT JOIN p_caja cx ON c.p_caja_id = cx.p_caja_id`
const joinNuevo = `    FROM p_cuotas_detalle c
    LEFT JOIN p_caja cx ON c.p_caja_id = cx.p_caja_id
    LEFT JOIN p_estructuras_egresos eg ON eg.estructura_id = cx.estructura_egreso_id`
if (!def.includes(joinViejo)) throw new Error('FROM not found')
def = def.replace(joinViejo, joinNuevo)
fs.writeFileSync('temp_sql/62_compromisos_descripcion.sql', def)
await q(def)
console.log('deployed ✓')
// verificacion: cuotas de tarjeta 9
console.log(JSON.stringify(await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);
SELECT cuota_id, fecha_estimada_pago, descripcion, monto_cuota FROM fn_reporte_compromisos_tarjeta(9) ORDER BY fecha_estimada_pago LIMIT 8;
COMMIT;`), null, 1))