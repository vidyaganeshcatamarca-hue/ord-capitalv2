import fs from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const auth = (await c.query('SELECT auth_id FROM usuarios WHERE user_id = 195')).rows[0].auth_id

const runUser = async (sql) => {
  const res = await c.query(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${auth}","role":"authenticated"}', true);
${sql}
ROLLBACK;`)
  const arr = Array.isArray(res) ? res : [res]
  return arr.at(-1).rows
}

console.log('vencimientos 195:', JSON.stringify(await runUser('SELECT * FROM fn_reporte_vencimientos_tarjetas()'), null, 1).slice(0, 900))
console.log('mapa 195:', JSON.stringify(await runUser('SELECT * FROM fn_reporte_mapa_tarjetas()'), null, 1).slice(0, 700))
await c.end()