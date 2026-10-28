import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const cols = await q(`select column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_name='p_inversiones' and table_schema='public' order by ordinal_position`)
console.log('COLUMNAS p_inversiones')
for (const c of cols) console.log('  ' + c.column_name.padEnd(26) + c.data_type.padEnd(14) + (c.is_nullable === 'YES' ? 'NULL ok  ' : 'NOT NULL ') + (c.column_default ?? ''))

const nulls = await q(`select count(*) filter (where billetera_origen_id is null) as sin_billetera,
                              count(*) as total from p_inversiones`)
console.log('FILAS ' + JSON.stringify(nulls))

const fks = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
  where conrelid='public.p_inversiones'::regclass and contype in ('f','c')`)
console.log('CONSTRAINTS')
for (const f of fks) console.log('  ' + f.conname + ': ' + f.def)
