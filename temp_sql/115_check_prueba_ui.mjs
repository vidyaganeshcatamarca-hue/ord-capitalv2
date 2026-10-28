import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())
const r = await q(`select i.inversion_id, i.user_id, i.nombre_activo, i.billetera_origen_id,
                          i.monto_invertido_original, i.valor_mercado_actual, i.tasa_anual_tna,
                          i.fecha_inicio, i.moneda, i.estado, i.monto_liquidado,
                          (select count(*) from p_caja c where c.metadata->>'inversion_id' = i.inversion_id::text) as movimientos
                     from p_inversiones i where i.nombre_activo like 'ZZ PRUEBA UI%'`)
console.log('FILA ' + JSON.stringify(r))
const total = await q(`select count(*) as n from p_caja where detalle like '%ZZ PRUEBA UI%'`)
console.log('MOVIMIENTOS CON ESE NOMBRE ' + JSON.stringify(total))
