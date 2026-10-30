// Despliega 160 (techo en transferencias) y corre los cuatro escenarios de
// temp_sql/161_probe_transferencias.sql, que terminan en RAISE y revierten todo.
//
//   node temp_sql/161_deploy_160.mjs
import fs from 'node:fs'

const env = {}
for (const linea of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]

const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  return { ok: r.ok, j: await r.json() }
}

const acl = async () => {
  const r = await q(`select coalesce(array_to_string(p.proacl, ','), '(default)') a
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_transferir_entre_sobres'`)
  return r.j[0].a
}

console.log('ACL antes:', await acl())

const deploy = await q(fs.readFileSync('temp_sql/160_techo_en_transferencias.sql', 'utf8'))
if (!deploy.ok) {
  console.log('DEPLOY FALLO:', JSON.stringify(deploy.j).slice(0, 400))
  process.exit(1)
}
console.log('160 desplegado | ACL despues:', await acl())

const probe = await q(fs.readFileSync('temp_sql/161_probe_transferencias.sql', 'utf8'))
const msg = (probe.j.message || '')
  .replace(/^.*?P0001:\s*/, '')
  .replace(/\nCONTEXT[\s\S]*$/, '')

console.log('')
for (const linea of msg.split('\\n')) console.log(linea)

const resto = await q(`select count(*) n from p_presupuestos
  where user_id = 1 and mes_periodo = '2026-10-01'::date and monto_limite in (200000, 100000, 60000)`)
console.log('')
console.log('filas de prueba que quedaron:', resto.j[0].n, String(resto.j[0].n) === '0' ? '(revertido)' : '(QUEDO ALGO)')
