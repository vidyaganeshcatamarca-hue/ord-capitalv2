import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,400));return j}
const MES='2026-10-01'
const grant = () => q(`grant execute on function public.fn_reporte_sobres_detalle(date) to authenticated`)
const snap = (uid) => `select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text j from (
  select * from (select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c
  cross join lateral fn_reporte_sobres_detalle('${MES}'::date) t) t`

// A) volver al 151 commiteado (estado previo a la fila del padre) y capturar
await q(fs.readFileSync('temp_sql/151_reporte_padres.sql','utf8'))
await grant()
const antes = {}
for (const uid of [1, 84]) antes[uid] = (await q(snap(uid)))[0].j
console.log('A) con 151: u1', JSON.parse(antes[1]).length, 'filas | u84', JSON.parse(antes[84]).length, 'filas')

// B) desplegar 155
await q(fs.readFileSync('temp_sql/155_reporte_fila_padre.sql','utf8'))
await grant()
console.log('B) 155 desplegado y grants reaplicados')

let ok = true
for (const uid of [1, 84]) {
  const d = (await q(snap(uid)))[0].j
  const igual = d === antes[uid]
  if (!igual) ok = false
  console.log(`   u${uid}: ${igual ? 'IDENTICO' : 'DISTINTO'} (${JSON.parse(d).length} filas)`)
}
const acl = await q(`select coalesce(array_to_string(p.proacl,','),'(default)') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_reporte_sobres_detalle'`)
console.log('   ACL:', acl[0].a)

// C) comportamiento con presupuesto de padre: todo revierte por el RAISE
const probe = `
DO $$
DECLARE v_padre bigint; v_nombre text; v_asig numeric; v_gasto numeric; v_disp numeric;
        v_hijos int; v_cuentan int; v_suma_gasto numeric; v_suma_disp numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text, true);
  SELECT e.padre_id, pe.nombre_cuenta INTO v_padre, v_nombre
    FROM p_estructuras_egresos e JOIN p_estructuras_egresos pe ON pe.estructura_id = e.padre_id
   WHERE e.user_id = 1 AND e.padre_id IS NOT NULL GROUP BY 1,2 LIMIT 1;
  INSERT INTO p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite)
  VALUES (1, v_padre, '${MES}'::date, 100000);
  SELECT r.monto_asignado, r.monto_gastado, r.monto_disponible INTO v_asig, v_gasto, v_disp
    FROM fn_reporte_sobres_detalle('${MES}'::date) r WHERE r.estructura_id = v_padre AND r.es_padre;
  SELECT count(*), count(*) FILTER (WHERE r.cuenta_en_totales),
         COALESCE(SUM(r.monto_gastado),0), COALESCE(SUM(r.monto_disponible),0)
    INTO v_hijos, v_cuentan, v_suma_gasto, v_suma_disp
    FROM fn_reporte_sobres_detalle('${MES}'::date) r WHERE r.padre_id = v_padre;
  RAISE EXCEPTION 'padre=% asignado=% gastado=% disponible=% || hijos=% cuentan_en_totales=% de esos || suma_gasto_hijos=% suma_disp_hijos=%',
    v_nombre, v_asig, v_gasto, v_disp, v_hijos, v_cuentan, v_suma_gasto, v_suma_disp;
END $$;`
let r
// El RAISE es el resultado esperado: aborta la transaccion y revierte todo.
try { r = await q(probe) } catch (e) { r = { message: e.message } }
const linea = (r.message||'').replace(/^Failed to run sql query: ERROR:\s*P0001:\s*/,'').replace(/\nCONTEXT[\s\S]*$/,'')
console.log('\nC) prueba con presupuesto de padre en', linea)
const resto = await q(`select count(*) n from p_presupuestos where mes_periodo='${MES}'::date and monto_limite=100000`)
console.log('   filas que quedaron:', resto[0].n, String(resto[0].n) === '0' ? '(revertido, nada persistio)' : '(QUEDO ALGO)')
console.log(ok ? '\nVERIFICADO: sin presupuesto de padre la salida es identica' : '\nFALLA: la salida cambio')
