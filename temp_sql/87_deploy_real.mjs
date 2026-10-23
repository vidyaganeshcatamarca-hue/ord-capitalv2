// Deploy REAL de temp_sql/87_modo_testing_por_feature.sql (autorizado por el
// dueño en esta sesion: "Ejecutalo vos, con este OK").
//
//   node temp_sql/87_deploy_real.mjs           (deploy + verificacion after)
//   node temp_sql/87_deploy_real.mjs --check   (solo verificacion, read-only)
//
// OJO: la divergencia activo_testing != activo NO es un fallo. Es el estado
// esperado en cuanto el dueño empieza a usar la feature. Lo que se verifica es
// la forma de la columna, la marca de semilla y la version de la funcion.
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 900))
  return json
}

const ONLY_CHECK = process.argv.includes('--check')

const snapshot = async () => {
  const [col] = await q(`select is_nullable, column_default, data_type
    from information_schema.columns
    where table_schema='public' and table_name='app_feature_flags' and column_name='activo_testing'`)
  const rows = await q(`select feature_key, activo${col ? ', activo_testing' : ''} from app_feature_flags order by orden, feature_key`)
  const rowsNorm = rows.map((r) => ({ ...r, activo_testing: 'activo_testing' in r ? r.activo_testing : null }))
  const [fn] = await q(`select (p.prosrc like '%v_testing_disponible THEN COALESCE(f.activo_testing%') as rev6
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='fn_obtener_modo_app'`)
  const [marker] = await q(`select exists(
      select 1 from app_global_config
       where clave = 'ff_testing_seed_aplicada' and valor = 'true') as ok`)
  return { col, rows: rowsNorm, fn, marker }
}

const shapeOk = (col) =>
  !!col && col.data_type === 'boolean' && col.is_nullable === 'NO' && String(col.column_default).startsWith('true')

const printState = (s) => {
  console.log('columna activo_testing:', s.col ? JSON.stringify(s.col) : 'NO EXISTE')
  console.log('filas:', s.rows.length, '| rev.6:', s.fn.rev6, '| semilla marcada:', s.marker.ok)
  const divergentes = s.rows.filter((r) => r.activo !== r.activo_testing)
  console.log('filas con activo_testing != activo (informativo):', divergentes.length,
    JSON.stringify(divergentes.slice(0, 25)))
}

console.log('=== ANTES ===')
const before = await snapshot()
printState(before)

if (ONLY_CHECK) {
  const ok = shapeOk(before.col) && before.fn.rev6 === true && before.marker.ok === true
  console.log('\nresultado:', ok ? 'OK' : 'REVISAR')
  process.exitCode = ok ? 0 : 1
} else {
  const sql = fs.readFileSync('temp_sql/87_modo_testing_por_feature.sql', 'utf8')
  await q(sql)
  console.log('deploy ejecutado (commit)')

  console.log('\n=== DESPUES ===')
  const after = await snapshot()
  printState(after)

  const cambios = []
  const mapBefore = new Map(before.rows.map((r) => [r.feature_key, r]))
  for (const r of after.rows) {
    const b = mapBefore.get(r.feature_key)
    if (!b) cambios.push({ feature_key: r.feature_key, nota: 'fila nueva' })
    else if (b.activo !== r.activo) cambios.push({ feature_key: r.feature_key, activo: `${b.activo} -> ${r.activo}` })
  }
  console.log('activo alterado en filas existentes:', cambios.length, JSON.stringify(cambios))

  const ok = shapeOk(after.col) && after.fn.rev6 === true && after.marker.ok === true && cambios.length === 0
  console.log('\nresultado:', ok ? 'OK' : 'REVISAR')
  process.exitCode = ok ? 0 : 1
}
