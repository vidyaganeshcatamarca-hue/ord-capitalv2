import fs from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
for (const n of ['fn_crear_tarjeta_credito', 'fn_obtener_saldo_pasivo_tarjetas', 'fn_reporte_patrimonio_neto_consolidado', 'fn_reporte_patrimonio_neto', 'fn_gestionar_deuda', 'fn_registrar_movimiento_caja']) {
  const oid = (await c.query('SELECT oid FROM pg_proc WHERE proname = $1 LIMIT 1', [n])).rows[0].oid
  const d = await c.query('SELECT pg_get_functiondef($1::oid) def', [oid])
  await fs.promises.writeFile(`temp_sql/_live/p70_${n}.sql`, d.rows[0].def)
}
console.log('dumps ok')
await c.end()