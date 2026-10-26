// Aplica la 96 (nominal general con retiros) y verifica el cálculo contra los datos.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const sql = fs.readFileSync('temp_sql/96_nominal_general_con_retiros.sql','utf8')
const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
console.log(r?.message ? '✗ ' + r.message : '✓ 96 aplicada (' + sql.split('\n').length + ' líneas)')

console.log('\n=== definición desplegada ===')
console.log(JSON.stringify(await q(`
  select (pg_get_functiondef(p.oid) like '%v_total_actual + v_total_retirado - v_total_original%') as suma_retiros,
         (pg_get_functiondef(p.oid) like '%total_liquidado%') as agrega_el_dato
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_rendimiento_vs_inflacion'`)))

console.log('\n=== usuarios con retiros: nominal viejo vs nuevo (por moneda, sin convertir) ===')
console.log(JSON.stringify(await q(`
  select i.user_id,
         count(*) as inversiones,
         sum(i.monto_invertido_original) as capital,
         sum(coalesce(i.valor_mercado_actual, i.monto_invertido_original)) as valor,
         sum(coalesce(i.monto_liquidado,0)) as retirado,
         round(((sum(coalesce(i.valor_mercado_actual, i.monto_invertido_original)) - sum(i.monto_invertido_original)) / nullif(sum(i.monto_invertido_original),0)) * 100, 2) as nominal_viejo,
         round(((sum(coalesce(i.valor_mercado_actual, i.monto_invertido_original)) + sum(coalesce(i.monto_liquidado,0)) - sum(i.monto_invertido_original)) / nullif(sum(i.monto_invertido_original),0)) * 100, 2) as nominal_nuevo
  from public.p_inversiones i
  where i.estado = 'activa'
  group by i.user_id
  having sum(coalesce(i.monto_liquidado,0)) > 0
  order by i.user_id`), null, 1))
