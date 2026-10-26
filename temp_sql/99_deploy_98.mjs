// Aplica la 98 (agregar capital a una inversión) y verifica la definición desplegada.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const sql = fs.readFileSync('temp_sql/98_aportar_capital_inversion.sql','utf8')
const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
console.log(r?.message ? '✗ ' + r.message : '✓ 98 aplicada (' + sql.split('\n').length + ' líneas)')

const def = await q(`
  select pg_get_function_identity_arguments(p.oid) as args,
         (pg_get_functiondef(p.oid) like '%valor_mercado_actual%') as toca_valor_mercado,
         (pg_get_functiondef(p.oid) like '%fecha_inicio%') as toca_fecha_inicio,
         (pg_get_functiondef(p.oid) like '%monto_liquidado%') as toca_liquidado,
         (pg_get_functiondef(p.oid) like '%monto_invertido_original + p_monto%') as suma_capital,
         (pg_get_functiondef(p.oid) like '%''es_aporte'', true%') as marca_aporte
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_aportar_inversion'`)
console.log('DEFINICIÓN:', JSON.stringify(def, null, 1))
console.log('Esperado: toca_valor_mercado FALSE, toca_fecha_inicio FALSE, toca_liquidado FALSE, suma_capital TRUE, marca_aporte TRUE')
