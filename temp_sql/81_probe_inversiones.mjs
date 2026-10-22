// Diagnóstico READ-ONLY: ¿existen las RPC y tablas del módulo inversiones?
// Uso: node temp_sql/81_probe_inversiones.mjs  (lee .env.local, solo SELECT)
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}

console.log('=== 1. RPC funciones relacionadas con inversiones (public) ===')
const fns = await q(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, l.lanname as lang
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
    and p.proname ~* 'inversion|cartera|rendimiento|inflacion|distribuir|rescatar'
  order by p.proname`)
for (const f of fns) console.log(`- ${f.name}(${f.args}) [${f.lang}]`)

console.log('\n=== 2. Tablas relacionadas con inversiones ===')
const tabs = await q(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name ~* 'inversion|inflacion|conciliac'
  order by table_name`)
for (const t of tabs) console.log(`- ${t.table_name}`)

console.log('\n=== 3. Columnas de tablas de inversiones ===')
if (tabs.length) {
  const names = tabs.map((t) => `'${t.table_name}'`).join(',')
  const cols = await q(`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name in (${names})
    order by table_name, ordinal_position`)
  let last = ''
  for (const c of cols) {
    if (c.table_name !== last) { console.log(`\n-- ${c.table_name}`); last = c.table_name }
    console.log(`  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`)
  }
}

console.log('\n=== 4. RLS policies de inversiones ===')
const pols = await q(`
  select tablename, policyname, cmd, roles
  from pg_policies
  where schemaname = 'public' and tablename ~* 'inversion|inflacion'
  order by tablename, policyname`)
if (pols.length === 0) console.log('(sin policies que coincidan)')
for (const p of pols) console.log(`- ${p.tablename}: ${p.policyname} [${p.cmd}] roles=${JSON.stringify(p.roles)}`)

console.log('\n=== 5. RLS habilitado? ===')
const rls = await q(`
  select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname ~* 'inversion|inflacion'
  order by c.relname`)
for (const r of rls) console.log(`- ${r.relname}: rls=${r.relrowsecurity}`)

console.log('\n=== 6. Triggers de inversiones ===')
const trg = await q(`
  select event_object_table as tbl, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
  where trigger_schema = 'public' and event_object_table ~* 'inversion|inflacion'
  order by event_object_table, trigger_name`)
if (trg.length === 0) console.log('(sin triggers)')
for (const t of trg) console.log(`- ${t.tbl}: ${t.trigger_name} ${t.action_timing} ${t.event_manipulation}`)