import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const antes = (await q(`select inversion_id, monto_invertido_original as capital, valor_mercado_actual as valor,
                                 monto_liquidado as retirado, tasa_anual_tna as tna, fecha_inicio, estado
                            from p_inversiones where inversion_id = 1`))
const movsAntes = await q(`select count(*) as n from p_caja where metadata->>'inversion_id' = '1'`)
console.log('ANTES ' + JSON.stringify(antes))
console.log('MOVIMIENTOS ' + JSON.stringify(movsAntes))

const sql = fs.readFileSync('temp_sql/118_fix_bitcoin_capital.sql','utf8')
const r = await q(`BEGIN;\n${sql}\nCOMMIT;`)
if (r?.message) { console.log('✗ falló: ' + r.message); process.exit(1) }

const despues = (await q(`select inversion_id, monto_invertido_original as capital, valor_mercado_actual as valor,
                                  monto_liquidado as retirado, tasa_anual_tna as tna, fecha_inicio, estado,
                                  (monto_invertido_original - monto_liquidado) as capital_neto,
                                  (valor_mercado_actual + monto_liquidado - monto_invertido_original) as ganancia
                             from p_inversiones where inversion_id = 1`))[0]
const movsDespues = await q(`select count(*) as n from p_caja where metadata->>'inversion_id' = '1'`)
console.log('DESPUÉS ' + JSON.stringify(despues))
console.log('MOVIMIENTOS ' + JSON.stringify(movsDespues))

const ok = Number(despues.capital) === 600000
  && Number(despues.valor) === 550000
  && Number(despues.retirado) === 250000
  && Number(despues.ganancia) === 200000
  && movsDespues[0].n === movsAntes[0].n
console.log(ok ? '✓ capital 600.000, valor y retiros intactos, ganancia +200.000' : '✗ POSTCHECK FALLÓ')
