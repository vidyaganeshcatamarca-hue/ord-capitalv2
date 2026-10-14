// Diagnóstico read-only: cuotas de tarjetas de user 1 vs lo que reportan las RPC.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
if (!ACCESS_TOKEN || !PROJECT) { console.error('env fail'); process.exit(1) }

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

const out = (label, rows) => console.log(`\n== ${label}\n${JSON.stringify(rows, null, 1).slice(0, 3000)}`)

// 1. Tarjetas de user 1
out('tarjetas user 1', await q(`SELECT tarjeta_id, nombre_tarjeta, dia_cierre, dia_vencimiento, activa, saldo_a_favor, saldo_a_favor_usd FROM p_tarjetas_credito WHERE user_id = 1 ORDER BY tarjeta_id`))

// 2. Cuotas por estado y ventana
out('cuotas user 1 por estado', await q(`
SELECT t.tarjeta_id, t.nombre_tarjeta, cd.pagado, count(*) n,
       sum(cd.monto_cuota) total, min(cd.fecha_estimada_pago) min_f, max(cd.fecha_estimada_pago) max_f
FROM p_cuotas_detalle cd JOIN p_tarjetas_credito t ON t.tarjeta_id = cd.tarjeta_id
WHERE t.user_id = 1
GROUP BY t.tarjeta_id, t.nombre_tarjeta, cd.pagado ORDER BY t.tarjeta_id, cd.pagado`))

// 3. Cuotas impagas por mes de fecha_estimada_pago
out('cuotas impagas x mes', await q(`
SELECT t.tarjeta_id, date_trunc('month', cd.fecha_estimada_pago)::date mes, count(*) n, sum(cd.monto_cuota) total
FROM p_cuotas_detalle cd JOIN p_tarjetas_credito t ON t.tarjeta_id = cd.tarjeta_id
WHERE t.user_id = 1 AND cd.pagado = false
GROUP BY t.tarjeta_id, mes ORDER BY t.tarjeta_id, mes`))

// 3b. Columnas p_caja_cuarentena
out("cols cuarentena", await q(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 0x2727'p_caja_cuarentena 0x27`.replace('p_caja_cuarentena ','p_caja_cuarentena'))`))

// 4. Muestras de las cuotas del ciclo anterior (impagas)
out('muestra cuotas impagas viejas', await q(`
SELECT *
FROM p_cuotas_detalle cd JOIN p_tarjetas_credito t ON t.tarjeta_id = cd.tarjeta_id
WHERE t.user_id = 1 AND cd.pagado = false
ORDER BY cd.fecha_estimada_pago LIMIT 25`))

// 5. Region de user 1
out('region user 1', await q(`SELECT * FROM p_config_region WHERE user_id = 1`))

// 5b. Movimientos de user 1 con cuotas (sept) 
out('movs user 1 ago-oct tarjetas', await q(`
SELECT *
FROM p_caja m WHERE m.user_id = 1 AND m.tarjeta_id IS NOT NULL
AND m.fecha >= date '2026-08-15' AND m.fecha <= date '2026-10-13'
ORDER BY m.fecha DESC LIMIT 15`))

// 7. Como se creo cada cuota impaga (card_diff?) 
out('cuotas impagas detalle', await q(`
SELECT cd.*, t.nombre_tarjeta FROM p_cuotas_detalle cd JOIN p_tarjetas_credito t ON t.tarjeta_id = cd.tarjeta_id
WHERE t.user_id = 1 AND cd.pagado = false ORDER BY cd.fecha_estimada_pago`))

// 6. Columnas de p_cuotas_detalle (por si hay snapshot/valor_local)
out('columnas cuotas', await q(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'p_cuotas_detalle' ORDER BY ordinal_position`))