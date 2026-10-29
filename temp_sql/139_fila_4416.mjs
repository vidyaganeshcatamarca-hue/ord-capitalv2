// Fila 4416: la pata en USD quedo con moneda='ARS'. Se corrige la etiqueta y se vuelve
// a fijar el snapshot del 29/09 (el trigger recalcula valor_local con la tasa de hoy
// cuando cambia moneda; el dueno pidio conservar la cotizacion historica).
// Las dos sentencias van en un solo request = una sola transaccion.
import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,500));return j}

const hermanas = await q(`select p_caja_id, tipo, moneda, es_usd, valor_ingreso, valor_local
  from p_caja where p_caja_id in (4416,4448,4464) order by 1`)
console.log('patas USD antes:', JSON.stringify(hermanas))
const saldoAntes = (await q(`select round(sum(saldo_actual),2) as s from p_billeteras where user_id=1`))[0].s
const b400Antes = (await q(`select saldo_actual from p_billeteras where billetera_id=400`))[0].saldo_actual
console.log('saldo total antes:', saldoAntes, '| billetera 400:', b400Antes)

await q(`
BEGIN;
UPDATE p_caja SET moneda='USD', es_usd=true WHERE p_caja_id=4416;
UPDATE p_caja SET valor_local=98531.98, moneda_local='ARS', tasa_snapshot=1515.8766 WHERE p_caja_id=4416;
COMMIT;
`)

const fila = await q(`select p_caja_id, tipo, moneda, es_usd, valor_ingreso, valor_local, moneda_local, tasa_snapshot
  from p_caja where p_caja_id=4416`)
console.log('\nfila 4416 despues:', JSON.stringify(fila))
const saldoDespues = (await q(`select round(sum(saldo_actual),2) as s from p_billeteras where user_id=1`))[0].s
const b400Despues = (await q(`select saldo_actual from p_billeteras where billetera_id=400`))[0].saldo_actual
console.log('saldo total despues:', saldoDespues, '| billetera 400:', b400Despues)
console.log(saldoAntes === saldoDespues && b400Antes === b400Despues ? '\nOK: los saldos no se movieron' : '\nALERTA: cambio un saldo')
