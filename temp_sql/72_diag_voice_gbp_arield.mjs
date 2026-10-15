// Diagnóstico solo-lectura: voice → cuarentena para arieldere75@gmail.com
// Modelo: temp_sql/53_rpc_user1.mjs (Management API + ACCESS_TOKEN de .env.local).
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
const out = (label, rows) => console.log(`\n== ${label}\n${JSON.stringify(rows, null, 1).slice(0, 4000)}`)

// 0. usuario objetivo
const u = await q(`
  SELECT us.user_id, us.nombre, au.email
  FROM usuarios us JOIN auth.users au ON au.id = us.auth_id
  WHERE au.email = 'arieldere75@gmail.com' LIMIT 1`)
const USER_ID = u[0]?.user_id
out('usuario', u)

// 1. región/divisas: moneda local y cotización GBP
out('region usuario', await q(`
  SELECT pais_codigo, moneda_default, confirmado_at FROM p_config_region WHERE user_id = ${USER_ID}`))
out('divisas GBP/USD', await q(`
  SELECT nombre, valor_por_usd, ultima_actualizacion FROM p_divisas WHERE nombre IN ('GBP','USD') ORDER BY nombre`))

// 2. billeteras y tarjetas del usuario
out('billeteras', await q(`
  SELECT billetera_id, nombre, moneda, activa FROM p_billeteras WHERE user_id = ${USER_ID} ORDER BY billetera_id`))
out('tarjetas', await q(`
  SELECT tarjeta_id, nombre_tarjeta, activa, recargo_dolar_pct FROM p_tarjetas_credito WHERE user_id = ${USER_ID}`))

// 3. últimas filas de cuarentena origen voz
out('cuarentena voz (últimas 8)', await q(`
  SELECT pendiente_id, tipo, estado, monto, moneda, fecha, billetera_id,
         estructura_egreso_id, tarjeta_id IS NULL tarjeta_null,
         metadata->>'job_id' job_id, metadata->>'parse_error' parse_error,
         metadata->>'raw_movement' raw_movement, creado_at
  FROM p_caja_cuarentena WHERE user_id = ${USER_ID} AND origen = 'voz'
  ORDER BY pendiente_id DESC LIMIT 8`))

// 4. último voice job del usuario
out('voice_jobs (últimos 3)', await q(`
  SELECT job_id, status, stage, created_at, completed_at,
         left(request_context::text, 400) request_context_head,
         left(result::text, 500) result_head
  FROM voice_jobs WHERE user_id = '${USER_ID}'
  ORDER BY created_at DESC LIMIT 3`))

// 5. función desplegada: ¿asigna v_moneda_local?
out('fn_cargar_movimientos_voz deploy (vars + filtro moneda)', await q(`
  SELECT substring(pg_get_functiondef('public.fn_cargar_movimientos_voz(uuid, jsonb)'::regprocedure)
         from 1 for 3000) def_head`))

// 6. constraints de p_caja_cuarentena que puedan rechazar GBP
out('constraints p_caja_cuarentena', await q(`
  SELECT conname, contype, pg_get_constraintdef(oid) def
  FROM pg_constraint WHERE conrelid = 'p_caja_cuarentena'::regclass`))

// 7. columnas de moneda de la tabla
out('cols moneda de p_caja_cuarentena y p_tarjetas_credito', await q(`
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE (table_name = 'p_caja_cuarentena' AND column_name ILIKE 'moneda%')
     OR (table_name = 'p_tarjetas_credito' AND column_name ILIKE '%moneda%')`))