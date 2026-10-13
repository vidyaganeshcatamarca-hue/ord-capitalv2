// Corre el test 39 y muestra SIN parsear el mensaje del resultado (el JSON viaja
// escapado dentro del RAISE; para leer los fallos alcanza con ver el texto crudo).
import fs from 'node:fs'

const readEnv = (k) => (fs.readFileSync('.env.local', 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]
const REF = readEnv('SUPABASE_URL').replace('https://', '').split('.')[0]
const sql = fs.readFileSync('temp_sql/39_test_wu1.sql', 'utf-8')

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readEnv('ACCESS_TOKEN')}` },
  body: JSON.stringify({ query: sql }),
})
const text = await res.text()
if (!text.includes('ROLLBACK_FORZADO|')) {
  console.log('NO HAY REPORTE:', text.slice(0, 800))
  process.exit(1)
}
const bruto = text.slice(text.indexOf('ROLLBACK_FORZADO|'))
console.log(bruto.replace(/\\"/g, '"').slice(0, 5000))