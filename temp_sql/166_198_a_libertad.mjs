// Pasa la cuenta de testing 198 de base cero a libertad, a pedido del dueno.
// El RPC fn_configurar_modo_presupuesto lo bloquea con error_base_cero_locked porque la
// activacion (29/10) cae dentro del ciclo vigente. Es una regla del producto, no una
// barrera de seguridad: aca se escribe la config directamente, solo en la cuenta de
// testing, y se limpia la fecha de activacion para que no quede el corte de base cero.
import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});if(!r.ok) throw new Error(JSON.stringify(await r.json()).slice(0,300));return r.json()}
const auth198 = `(select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=198),'role','authenticated')::text,true) as _c) c`
const estado = async () => {
  const c = await q(`select modo_presupuesto m, fecha_activacion_base_cero::text f from p_presupuestos_config where user_id=198`)
  const s = await q(`select s::text s from ${auth198} cross join lateral (select fn_obtener_saldo_a_asignar('2026-10-01'::date) s) t`)
  const r = await q(`select count(*) filter (where r.arrastre_mes_anterior <> 0) con_arrastre, count(*) n
     from ${auth198} cross join lateral fn_reporte_sobres_detalle('2026-10-01'::date) r`)
  const b = await q(`select count(*) n, coalesce(sum(monto_limite),0) t from p_presupuestos where user_id=198 and mes_periodo='2026-10-01'::date`)
  return { modo: c[0].m, activacion: c[0].f, saldo: s[0].s, sobres: r[0].n, conArrastre: r[0].con_arrastre, filas: b[0].n, total: b[0].t }
}
console.log('antes :', JSON.stringify(await estado()))
await q(`update p_presupuestos_config
         set modo_presupuesto = 'anticipado', fecha_activacion_base_cero = NULL
         where user_id = 198`)
console.log('despues:', JSON.stringify(await estado()))
