import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,300));return j}
const MES='2026-10-01'
const snapshot = (uid) => `select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text j from (
  select * from (select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c
  cross join lateral fn_reporte_sobres_detalle('${MES}'::date) t) t`

const antes = {}
for (const uid of [1, 84]) antes[uid] = (await q(snapshot(uid)))[0].j
console.log('antes: u1', JSON.parse(antes[1]).length, 'filas | u84', JSON.parse(antes[84]).length, 'filas')

await q(fs.readFileSync('temp_sql/155_reporte_fila_padre.sql','utf8'))
await q(`grant execute on function public.fn_reporte_sobres_detalle(date) to authenticated`)
console.log('\n155 desplegado')

let ok = true
for (const uid of [1, 84]) {
  const d = (await q(snapshot(uid)))[0].j
  const igual = d === antes[uid]
  if (!igual) ok = false
  console.log(`   u${uid}: ${igual ? 'IDENTICO' : 'DISTINTO'} (${JSON.parse(d).length} filas)`)
}
console.log(ok ? 'VERIFICADO: sin presupuesto de padre nada cambia' : 'FALLA: cambio la salida')

// Prueba de comportamiento con un presupuesto de padre, todo dentro de un bloque que
// termina en RAISE: la transaccion se revierte y no queda nada en la base.
const probe = `
DO $$
DECLARE v_padre bigint; v_msg text; v_gasto numeric; v_asig numeric; v_disp numeric;
        v_hijos int; v_hijos_cuentan int; v_suma_hijos numeric; v_total_pool numeric; v_nombre text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text, true);
  SELECT e.padre_id, pe.nombre_cuenta INTO v_padre, v_nombre
    FROM p_estructuras_egresos e JOIN p_estructuras_egresos pe ON pe.estructura_id = e.padre_id
   WHERE e.user_id = 1 AND e.padre_id IS NOT NULL GROUP BY 1,2 LIMIT 1;

  INSERT INTO p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite)
  VALUES (1, v_padre, '${MES}'::date, 100000);

  SELECT r.monto_gastado, r.monto_asignado, r.monto_disponible INTO v_gasto, v_asig, v_disp
    FROM fn_reporte_sobres_detalle('${MES}'::date) r WHERE r.estructura_id = v_padre AND r.es_padre;

  SELECT count(*), count(*) FILTER (WHERE r.cuenta_en_totales), COALESCE(SUM(r.monto_gastado),0), COALESCE(SUM(r.monto_disponible),0)
    INTO v_hijos, v_hijos_cuentan, v_suma_hijos, v_total_pool
    FROM fn_reporte_sobres_detalle('${MES}'::date) r WHERE r.padre_id = v_padre;

  RAISE EXCEPTION 'padre=% asignado=% gastado=% disponible=% | hijos=% gasto_suma=% cuentan=% | pool=%',
    v_nombre, v_asig, v_gasto, v_disp, v_hijos, v_suma_hijos, v_hijos_cuentan, v_total_pool;
END $$;`
const r = await q(probe)
console.log('\nprueba con presupuesto de padre (se revierte):')
console.log('  ', (r.message || '').replace(/^Failed to run sql query: ERROR:\s*P0001:\s*/, '').replace(/\nCONTEXT[\s\S]*$/, ''))
const quedan = await q(`select count(*) n from p_presupuestos where mes_periodo='${MES}'::date and monto_limite=100000`)
console.log('   filas que quedaron de la prueba:', quedan[0].n, quedan[0].n === '0' ? '(revertido)' : '(QUEDO ALGO)')
