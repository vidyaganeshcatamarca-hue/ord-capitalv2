// Corre el ensayo + test transaccional de T3/S17 (titulos dinamicos).
// Misma mecanica que 74_run_test.mjs; en rollback: nada persiste.
// Uso: node --env-file=.env.local temp_sql/75_run_test.mjs
import fs from 'node:fs'
const readEnv = (k) => (fs.readFileSync('.env.local', 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const REF = readEnv('SUPABASE_URL').replace('https://', '').split('.')[0]
const endpoint = `https://api.supabase.com/v1/projects/${REF}/database/query`
const post = async (query) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readEnv('ACCESS_TOKEN')}` },
    body: JSON.stringify({ query }),
  })
  return { ok: res.ok, text: await res.text() }
}
const ddl = fs.readFileSync('temp_sql/75_deploy_monedas_titulos.sql', 'utf-8')
const test = fs.readFileSync('temp_sql/75_test_monedas_titulos.sql', 'utf-8')
console.log('ensayo DDL (BEGIN; deploy; ROLLBACK)... no es deploy real')
const ensayo = await post(`BEGIN;\n${ddl}\nROLLBACK;`)
if (!ensayo.ok) { console.log('ENSAYO FALLO:', ensayo.text.slice(0, 3000)); process.exit(1) }
console.log('ensayo OK (rollback)')
console.log('test transaccional (BEGIN; deploy; DO $test$...)')
const r = await post(`BEGIN;\n${ddl}\n${test}`)
if (!r.text.includes('ROLLBACK_FORZADO|')) { console.log('NO HAY REPORTE:', r.text.slice(0, 3000)); process.exit(1) }
const bruto = r.text.slice(r.text.indexOf('ROLLBACK_FORZADO|'))
console.log(bruto.replace(/\\"/g, '"').replace(/\n/g, '\n').slice(0, 12000))
if (!/result=PASS/.test(bruto)) { console.error('TEST FALLO (result != PASS)'); process.exit(1) }
