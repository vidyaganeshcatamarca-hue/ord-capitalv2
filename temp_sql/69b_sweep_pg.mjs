// Barrido de literales 'ARS'/'USD' por conexion directa (pg) — la Management API
// se ahoga con el catalogo completo. Solo lectura.
import fs from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: names } = await client.query(`
SELECT p.proname, p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' ORDER BY p.proname`)
console.log('funciones public:', names.length)

const broken = []
const out = {}
for (const r of names) {
  let def
  try {
    const d = await client.query('SELECT pg_get_functiondef($1::oid) def', [r.oid])
    def = d.rows[0]?.def ?? ''
  } catch (e) {
    broken.push(r.proname)
    continue
  }
  const nArs = (def.match(/'ARS'/g) || []).length
  const nUsd = (def.match(/'USD'/g) || []).length
  if (nArs + nUsd > 0) {
    out[r.proname] = { n_ars: nArs, n_usd: nUsd }
    await fs.promises.writeFile(`temp_sql/_live/sweep_${r.proname.replace(/[^a-z0-9]/gi, '_')}.sql`, def)
  }
}
fs.writeFileSync('temp_sql/69_sweep_literales.json', JSON.stringify({ out, broken }, null, 1))
const sorted = Object.entries(out).sort((a, b) => (b[1].n_ars + b[1].n_usd) - (a[1].n_ars + a[1].n_usd))
for (const [name, v] of sorted) console.log(`${String(v.n_ars).padStart(3)} ARS / ${String(v.n_usd).padStart(3)} USD  ${name}`)
if (broken.length) console.log('sin def (ruleutils):', broken.join(', '))
await client.end()