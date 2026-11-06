// Valida temp_sql/90_*.sql contra Postgres REAL sin dejarlo aplicado.
// BEGIN; <archivo>; <consultas de prueba>; ROLLBACK;
// DDL en Postgres es transaccional: al hacer ROLLBACK no queda nada.
import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  return { ok: res.ok, json }
}

const sql = fs.readFileSync('temp_sql/90_inflacion_vigente_y_retiro_parcial.sql', 'utf8')

const compuesto = `BEGIN;
${sql}
-- Pruebas dentro de la transaccion: si algo falla, el error sale aca.
SELECT jsonb_build_object(
  'u1',   public.fn_inflacion_vigente(1),
  'u198', public.fn_inflacion_vigente(198),
  'u999', public.fn_inflacion_vigente(999999)
) AS prueba;
ROLLBACK;`

const r = await q(compuesto)
if (!r.ok) {
  console.log('✗ FALLO AL COMPILAR/EJECUTAR')
  console.log(JSON.stringify(r.json).slice(0, 1200))
  process.exit(1)
}

// La API devuelve el resultado del ULTIMO statement por lote; si no, se
// vuelve a preguntar por la funcion (que ahora NO existe, porque hubo rollback).
console.log('resultado crudo:', JSON.stringify(r.json).slice(0, 900))
