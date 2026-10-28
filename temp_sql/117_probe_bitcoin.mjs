import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

console.log('INVERSION 1 ' + JSON.stringify(await q(`select inversion_id, user_id, nombre_activo, billetera_origen_id, monto_invertido_original,
       valor_mercado_actual, monto_liquidado, tasa_anual_tna, fecha_inicio, moneda, estado from p_inversiones where inversion_id = 1`)))
console.log('MOVIMIENTOS ' + JSON.stringify(await q(`select p_caja_id, fecha, tipo, billetera_origen_id as w, valor_egreso, valor_ingreso, detalle, metadata
   from p_caja where metadata->>'inversion_id' = '1' order by fecha, p_caja_id`)))
console.log('BILLETERA 2 ' + JSON.stringify(await q(`select billetera_id, nombre, moneda, saldo_actual from p_billeteras where billetera_id = 2`)))
console.log('APORTE MODELO 5333 ' + JSON.stringify(await q(`select p_caja_id, user_id, fecha, tipo, billetera_origen_id, billetera_destino_id,
       valor_egreso, valor_ingreso, estructura_egreso_id, moneda, valor_local, moneda_local, tasa_snapshot, en_balance_activo, es_compartido, detalle, metadata
   from p_caja where p_caja_id = 5333`)))
console.log('COMPRA 5156 ' + JSON.stringify(await q(`select p_caja_id, fecha, billetera_origen_id, valor_egreso, estructura_egreso_id, moneda, valor_local, moneda_local, tasa_snapshot, en_balance_activo, detalle
   from p_caja where p_caja_id = 5156`)))
