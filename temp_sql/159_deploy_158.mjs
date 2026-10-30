import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,400));return j}
const MES='2026-10-01'

const antesAcl = async () => (await q(`select coalesce(array_to_string(p.proacl,','),'(default)') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_asignar_presupuesto'`))[0].a
console.log('ACL antes:', await antesAcl())
await q(fs.readFileSync('temp_sql/158_techo_al_asignar.sql','utf8'))
console.log('158 desplegado | ACL despues:', await antesAcl())

const probe = `
DO $$
DECLARE v_p bigint; v_hijos bigint[]; v_mes date := '${MES}'::date; v_nombre text;
        ra text; rb text; rc text; rd text; re text; rf text; rg text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text, true);
  SELECT e.padre_id, pe.nombre_cuenta INTO v_p, v_nombre
    FROM p_estructuras_egresos e JOIN p_estructuras_egresos pe ON pe.estructura_id=e.padre_id
   WHERE e.user_id=1 AND e.padre_id IS NOT NULL GROUP BY 1,2 ORDER BY 1 LIMIT 1;
  SELECT array_agg(estructura_id ORDER BY estructura_id) INTO v_hijos FROM p_estructuras_egresos WHERE padre_id=v_p AND user_id=1;
  DELETE FROM p_presupuestos WHERE user_id=1 AND mes_periodo=v_mes AND estructura_egreso_id = ANY(v_hijos || v_p);

  -- A: padre sin presupuesto, el hijo asigna libre
  BEGIN PERFORM fn_asignar_presupuesto(v_hijos[1], 60000, v_mes); ra := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN ra := SQLERRM; END;
  -- B: techo del padre en 100.000
  BEGIN PERFORM fn_asignar_presupuesto(v_p, 100000, v_mes); rb := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN rb := SQLERRM; END;
  -- C: segundo hijo 50.000 con 60.000 ya repartido -> tiene que rechazar
  BEGIN PERFORM fn_asignar_presupuesto(v_hijos[2], 50000, v_mes); rc := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN rc := SQLERRM; END;
  -- D: segundo hijo 40.000 -> completa el techo, acepta
  BEGIN PERFORM fn_asignar_presupuesto(v_hijos[2], 40000, v_mes); rd := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN rd := SQLERRM; END;
  -- E: bajar el padre a 90.000 con 100.000 repartido -> rechaza con el detalle
  BEGIN PERFORM fn_asignar_presupuesto(v_p, 90000, v_mes); re := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN re := SQLERRM; END;
  -- F: subir el padre a 120.000 -> acepta
  BEGIN PERFORM fn_asignar_presupuesto(v_p, 120000, v_mes); rf := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN rf := SQLERRM; END;
  -- G: subir el primer hijo a 90.000 con 40.000 en el otro -> quedan 80.000, rechaza
  BEGIN PERFORM fn_asignar_presupuesto(v_hijos[1], 90000, v_mes); rg := 'ACEPTA';
        EXCEPTION WHEN OTHERS THEN rg := SQLERRM; END;

  RAISE EXCEPTION E'padre=%\nA hijo sin techo 60000: %\nB techo 100000: %\nC hijo 50000 (60+50>100): %\nD hijo 40000 (justo el techo): %\nE padre 90000 (repartido 100000): %\nF padre 120000: %\nG hijo 90000 (40+90>120): %',
    v_nombre, ra, rb, rc, rd, re, rf, rg;
END $$;`

let salida = ''
try { await q(probe) } catch (e) { salida = e.message }
salida = salida.replace(/^.*?ERROR:\s*P0001:\s*/, '').replace(/\nCONTEXT[\s\S]*$/, '')
console.log('\n' + salida.split('\n').join('\n'))
const resto = await q(`select count(*) n from p_presupuestos where user_id=1 and mes_periodo='${MES}'::date and monto_limite in (60000,100000,90000,120000,50000,40000,90000)`)
console.log('\nfilas de prueba que quedaron:', resto[0].n, String(resto[0].n)==='0' ? '(revertido)' : '(QUEDO ALGO)')
