// Deploy de temp_sql/90_inflacion_vigente_y_retiro_parcial.sql a producción.
// Atómico: BEGIN; <archivo>; COMMIT; — si algo falla, no queda nada a medias.
// Autorizado por el dueño el 2026-10-23.
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

if (/DROP\s+FUNCTION/i.test(sql)) {
  console.log('✗ el archivo contiene DROP FUNCTION: no se aplica')
  process.exit(1)
}

const r = await q(`BEGIN;\n${sql}\nCOMMIT;`)
if (!r.ok) {
  console.log('✗ FALLO EL DEPLOY (nada quedó aplicado por el rollback implícito)')
  console.log(JSON.stringify(r.json).slice(0, 900))
  process.exit(1)
}
console.log('✓ COMMIT aplicado')
