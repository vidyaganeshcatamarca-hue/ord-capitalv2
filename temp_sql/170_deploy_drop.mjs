// Borra la sobrecarga legacy y verifica que la función vuelva a resolverse sola.
//   node temp_sql/170_deploy_drop.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (sql) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method:'POST', headers:{Authorization:`Bearer ${env.ACCESS_TOKEN}`,'Content-Type':'application/json'}, body: JSON.stringify({query: sql}) }); return { ok: r.ok, j: await r.json() } }

const firmas = async () => (await q(`
  select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_configurar_formato_moneda' order by 1`)).j

console.log('ANTES:', (await firmas()).map(f => f.f).join('  |  '))

const d = await q(fs.readFileSync('temp_sql/170_drop_sobrecarga_smallint.sql', 'utf8'))
if (!d.ok) { console.log('DROP FALLO:', JSON.stringify(d.j).slice(0, 400)); process.exit(1) }

const despues = await firmas()
console.log('DESPUES:', despues.map(f => f.f).join('  |  '))

// La prueba que importa: llamarla como lo hace el cliente, sin castear, impersonando
// al usuario 1. Si volviera la ambigüedad, esto explota.
const llamada = await q(`
  select set_config('request.jwt.claims',
    json_build_object('sub','b90d1f17-f691-491a-a840-522510e67640','role','authenticated')::text, true) as claims;
`)
if (!llamada.ok) { console.log('CLAIMS FALLO:', JSON.stringify(llamada.j).slice(0, 300)); process.exit(1) }

const r = await q(`
  with claims as (
    select set_config('request.jwt.claims',
      json_build_object('sub','b90d1f17-f691-491a-a840-522510e67640','role','authenticated')::text, true)
  )
  select public.fn_configurar_formato_moneda('ARS', 2, '.', ',') is not null as ok
    from claims`)
console.log('llamada sin castear p_decimals:', r.ok ? JSON.stringify(r.j) : 'ERROR ' + JSON.stringify(r.j).slice(0, 400))
console.log('')
console.log(despues.length === 1 && r.ok ? 'PASS' : 'FAIL')
