// Despliega 168 (asignar 0 a un rubro devuelve la plata al pozo) y corre la
// verificación transaccional de 169, que termina en RAISE y revierte todo.
//
//   node temp_sql/169_deploy_168.mjs
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

const MES = `date_trunc('month', current_date)::date`

const estadoPadre = async () => {
  const r = await q(`select e.estructura_id, e.nombre_cuenta,
      coalesce((select monto_limite from p_presupuestos p
                where p.estructura_egreso_id = e.estructura_id and p.user_id = 1
                  and p.mes_periodo = ${MES}), -1) as monto,
      (select count(*) from p_estructuras_egresos h where h.padre_id = e.estructura_id) as hijos
    from p_estructuras_egresos e
    where e.user_id = 1 and e.padre_id is null
      and exists (select 1 from p_estructuras_egresos h where h.padre_id = e.estructura_id)
    order by e.estructura_id`)
  return r.j
}

console.log('ANTES (padres del u1):')
for (const f of await estadoPadre()) {
  console.log(`  ${String(f.estructura_id).padStart(5)} ${String(f.nombre_cuenta).padEnd(24)} monto=${String(f.monto).padStart(8)} hijos=${f.hijos}`)
}

const deploy = await q(fs.readFileSync('temp_sql/168_padre_a_cero.sql', 'utf8'))
if (!deploy.ok) {
  console.log('DEPLOY FALLO:', JSON.stringify(deploy.j).slice(0, 500))
  process.exit(1)
}
console.log('')
console.log('168 desplegado')

const probe = await q(fs.readFileSync('temp_sql/169_probe_padre_a_cero.sql', 'utf8'))
const msg = (probe.j.message || '')
  .replace(/^.*?P0001:\s*/, '')
  .replace(/\nCONTEXT[\s\S]*$/, '')

console.log('')
console.log('PROBE:')
try {
  const parsed = JSON.parse(msg)
  console.log('  result:', parsed.result)
  for (const [k, v] of Object.entries(parsed.detail ?? {})) {
    console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  }
} catch {
  console.log('  (no se pudo parsear)', msg.slice(0, 600))
}

console.log('')
console.log('DESPUES (tiene que ser idéntico a ANTES: el probe revierte):')
for (const f of await estadoPadre()) {
  console.log(`  ${String(f.estructura_id).padStart(5)} ${String(f.nombre_cuenta).padEnd(24)} monto=${String(f.monto).padStart(8)} hijos=${f.hijos}`)
}
