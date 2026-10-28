import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())
console.log('FILAS ' + JSON.stringify(await q(`select count(*) as total, count(*) filter (where billetera_origen_id is null) as sin_billetera from p_inversiones`)))
console.log('PRUEBAS_RESTANTES ' + JSON.stringify(await q(`select count(*) as n from p_inversiones where nombre_activo like 'ZZ %'`)))
console.log('CAJA_PRUEBAS ' + JSON.stringify(await q(`select count(*) as n from p_caja where detalle like '%ZZ %'`)))
