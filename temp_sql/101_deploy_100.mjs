// Aplica la 100 (el aporte suma valor + lista de retiros) y verifica definición y datos.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

console.log('ANTES:', JSON.stringify(await q(`select inversion_id, nombre_activo, monto_invertido_original, valor_mercado_actual, monto_liquidado from p_inversiones where estado='activa' order by user_id, inversion_id`)))

const sql = fs.readFileSync('temp_sql/100_aporte_suma_valor_y_retiros.sql','utf8')
const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
console.log(r?.message ? '✗ ' + r.message : '✓ 100 aplicada (' + sql.split('\n').length + ' líneas)')
if (r?.message) process.exit(1)

console.log('\nDEFINICIÓN aporte:', JSON.stringify(await q(`
  select (pg_get_functiondef(p.oid) like '%valor_mercado_actual = COALESCE(valor_mercado_actual, monto_invertido_original) + p_monto%') as suma_al_valor,
         (pg_get_functiondef(p.oid) like '%monto_invertido_original + p_monto%') as suma_capital,
         (pg_get_functiondef(p.oid) like '%monto_liquidado%') as toca_liquidado,
         (pg_get_functiondef(p.oid) like '%fecha_inicio%') as toca_fecha_inicio
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_aportar_inversion'`)))

console.log('\nRETIROS:', JSON.stringify(await q(`select * from fn_retiros_inversiones()`)))
console.log('\nDESPUÉS:', JSON.stringify(await q(`select inversion_id, nombre_activo, monto_invertido_original, valor_mercado_actual, monto_liquidado from p_inversiones where estado='activa' order by user_id, inversion_id`)))
