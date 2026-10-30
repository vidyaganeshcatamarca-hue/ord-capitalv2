import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,300));return j}
const IDS = [10, 75, 2392, 2415]
const antes = await q(`select user_id, billetera_id, saldo_actual from p_billeteras where user_id in (1,84) order by 1,2`)

// guardas: que sean exactamente lo que dijimos y que no tengan dependencias
const dep = await q(`select count(*) n from p_caja where parent_pago_caja_id in (${IDS.join(',')})`)
if (Number(dep[0].n) > 0) throw new Error('abortado: hay filas hijas que dependen de las 4')
const match = await q(`select p_caja_id, user_id, valor_egreso, estructura_egreso_id from p_caja
   where p_caja_id in (${IDS.join(',')}) and tipo='expense'
   and exists (select 1 from p_estructuras_egresos h where h.padre_id = estructura_egreso_id) order by p_caja_id`)
console.log('a borrar:', JSON.stringify(match))
if (match.length !== 4) throw new Error(`abortado: esperaba 4 filas, encontre ${match.length}`)

const del = await q(`DELETE FROM p_caja WHERE p_caja_id in (${IDS.join(',')}) AND tipo='expense' RETURNING p_caja_id`)
console.log('borradas:', JSON.stringify(del))

const despues = await q(`select user_id, billetera_id, saldo_actual from p_billeteras where user_id in (1,84) order by 1,2`)
const key = r => `${r.user_id}-${r.billetera_id}`
const mapa = new Map(antes.map(r => [key(r), Number(r.saldo_actual)]))
console.log('\n=== saldos que se movieron ===')
for (const r of despues) {
  const a = mapa.get(key(r)); const d = Number(r.saldo_actual)
  if (a !== d) console.log(`   u${r.user_id} bill ${r.billetera_id}: ${a} -> ${d}  (${d - a > 0 ? '+' : ''}${(d - a).toFixed(2)})`)
}
const tot = await q(`select user_id, count(*) n, sum(valor_egreso) total from p_caja where tipo='expense' and user_id in (1,84) group by 1 order by 1`)
for (const r of tot) console.log(`\n   u${r.user_id}: ${r.n} egresos, suma ${r.total}`)
const quedan = await q(`select count(*) n from p_caja c where c.tipo='expense'
   and exists (select 1 from p_estructuras_egresos h where h.padre_id = c.estructura_egreso_id)`)
console.log('\n   movimientos que quedan en rubros padre:', JSON.stringify(quedan[0]))
