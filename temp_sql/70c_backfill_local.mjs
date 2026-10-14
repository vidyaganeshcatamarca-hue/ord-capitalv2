// Backfill moneda local: tarjetas + movimientos + cuotas donde el usuario tiene
// moneda local != 'ARS' y sus filas quedaron 'ARS' por defaults heredados.
// El trigger de p_caja re-congela valor_local (identidad, sin conversion).
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

// 0. quienes afecta
console.log('afectados:', JSON.stringify(await q(`
SELECT r.user_id, r.moneda_default,
       (SELECT count(*) FROM p_tarjetas_credito t WHERE t.user_id = r.user_id AND t.moneda_iso = 'ARS') tarjetas,
       (SELECT count(*) FROM p_caja c WHERE c.user_id = r.user_id AND c.moneda = 'ARS') moviemientos,
       (SELECT count(*) FROM p_cuotas_detalle cd WHERE cd.user_id = r.user_id AND cd.moneda = 'ARS') cuotas
FROM p_config_region r
WHERE r.moneda_default IS NOT NULL AND r.moneda_default <> 'ARS' ORDER BY r.user_id`)))

// 1. tarjetas
await q(`UPDATE p_tarjetas_credito t SET moneda_iso = r.moneda_default
FROM p_config_region r WHERE r.user_id = t.user_id AND t.moneda_iso = 'ARS'`)
console.log('tarjetas backfill ok')

// 2. movimientos (el trigger re-congela valor_local = identidad)
const movs = await q(`
WITH upd AS (
  UPDATE p_caja c SET moneda = r.moneda_default
  FROM p_config_region r
  WHERE r.user_id = c.user_id AND c.moneda = 'ARS'
  RETURNING c.p_caja_id, c.valor_egreso, c.valor_local, c.moneda_local
) SELECT count(*) n, min(valor_egreso) eg, min(valor_local) vl, min(moneda_local) ml FROM upd`)
console.log('movimientos:', JSON.stringify(movs))

// 3. cuotas
const cuo = await q(`
WITH upd AS (
  UPDATE p_cuotas_detalle cd SET moneda = r.moneda_default
  FROM p_config_region r
  WHERE r.user_id = cd.user_id AND cd.moneda = 'ARS'
  RETURNING cd.cuota_id
) SELECT count(*) n FROM upd`)
console.log('cuotas:', JSON.stringify(cuo))

// 4. verificacion final: 0 residuales
console.log('residuales:', JSON.stringify(await q(`
SELECT r.user_id,
       (SELECT count(*) FROM p_tarjetas_credito t WHERE t.user_id = r.user_id AND t.moneda_iso = 'ARS') tarj,
       (SELECT count(*) FROM p_caja c WHERE c.user_id = r.user_id AND c.moneda = 'ARS') movs,
       (SELECT count(*) FROM p_cuotas_detalle cd WHERE cd.user_id = r.user_id AND cd.moneda = 'ARS') cuots
FROM p_config_region r WHERE r.moneda_default IS NOT NULL AND r.moneda_default <> 'ARS'`)))