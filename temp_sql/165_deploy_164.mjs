import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});return {ok:r.ok, j:await r.json()}}
const dep = await q(fs.readFileSync('temp_sql/164_base_cero_hijo_dentro_del_techo.sql','utf8'))
if (!dep.ok) { console.log('DEPLOY FALLO:', JSON.stringify(dep.j).slice(0,400)); process.exit(1) }
console.log('164 desplegado')

const probe = `
DO $$
DECLARE v_p bigint := 4265; v_hijo bigint; v_mes date := '2026-10-01'::date; v_pool0 numeric; v_pool1 numeric; v_pool2 numeric;
        a text; b text; c text; d text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=198),'role','authenticated')::text, true);
  SELECT estructura_id INTO v_hijo FROM p_estructuras_egresos WHERE padre_id=v_p AND user_id=198 ORDER BY estructura_id LIMIT 1;
  DELETE FROM p_presupuestos WHERE user_id=198 AND mes_periodo=v_mes AND estructura_egreso_id IN (v_p, v_hijo);
  v_pool0 := fn_obtener_saldo_a_asignar(v_mes);
  BEGIN PERFORM fn_asignar_presupuesto(v_p, 2000, v_mes); a := 'ACEPTA'; EXCEPTION WHEN OTHERS THEN a := SQLERRM; END;
  v_pool1 := fn_obtener_saldo_a_asignar(v_mes);
  BEGIN PERFORM fn_asignar_presupuesto(v_hijo, 500, v_mes); b := 'ACEPTA'; EXCEPTION WHEN OTHERS THEN b := SQLERRM; END;
  v_pool2 := fn_obtener_saldo_a_asignar(v_mes);
  BEGIN PERFORM fn_asignar_presupuesto(v_hijo, 5000, v_mes); c := 'ACEPTA'; EXCEPTION WHEN OTHERS THEN c := SQLERRM; END;
  BEGIN PERFORM fn_asignar_presupuesto(v_p, 100, v_mes); d := 'ACEPTA'; EXCEPTION WHEN OTHERS THEN d := SQLERRM; END;
  RAISE EXCEPTION E'pozo % -> % -> %\nA padre 2000: %\nB hijo 500 (porcion del padre): %\nC hijo 5000 (sobre el techo): %\nD bajar el padre a 100 con 500 repartido: %',
    v_pool0, v_pool1, v_pool2, a, b, c, d;
END $$;`
const r = await q(probe)
const msg = (r.j.message||'').replace(/^.*?P0001:\s*/, '').replace(/\nCONTEXT[\s\S]*$/, '')
console.log(msg.split('\n').join('\n'))
const resto = await q(`select count(*) n from p_presupuestos where user_id=198 and mes_periodo='2026-10-01'::date and monto_limite in (2000,500,5000,100)`)
console.log('\nfilas de prueba que quedaron:', resto.j[0].n, String(resto.j[0].n)==='0' ? '(revertido)' : '(QUEDO ALGO)')
