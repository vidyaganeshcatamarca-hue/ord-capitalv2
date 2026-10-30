// Despliega 143 (el COALESCE del previo) y lo verifica con el mismo sobre que antes
// pasaba: el 2362 del usuario 198, sin fila previa en el ciclo.
//
// Las pruebas van en bloques DO que terminan en RAISE: el Management API devuelve ese
// RAISE como error HTTP, y ESE TEXTO es el resultado que buscamos. Nada queda escrito.
import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();return {ok:r.ok, j}}

const probar = async (uid, sobre, monto) => {
  const {ok, j} = await q(`
DO $$
DECLARE v_auth text; v_msg text; v_previo numeric; v_saldo numeric;
BEGIN
  SELECT auth_id INTO v_auth FROM usuarios WHERE user_id=${uid};
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_auth,'role','authenticated')::text, true);
  SELECT COALESCE(monto_limite,0) INTO v_previo FROM p_presupuestos
    WHERE estructura_egreso_id=${sobre} AND mes_periodo=date_trunc('month',CURRENT_DATE)::date AND user_id=${uid};
  v_saldo := public.fn_obtener_saldo_a_asignar(date_trunc('month',CURRENT_DATE)::date);
  BEGIN
    PERFORM public.fn_asignar_presupuesto(${sobre}, ${monto}, date_trunc('month',CURRENT_DATE)::date);
    v_msg := 'ACEPTADO';
  EXCEPTION WHEN OTHERS THEN v_msg := 'RECHAZADO';
  END;
  RAISE EXCEPTION 'previo=% saldo=% limite=% -> %', v_previo, v_saldo, ${monto}, v_msg;
END $$;`)
  const txt = (j.message || JSON.stringify(j))
    .replace(/^Failed to run sql query: ERROR:\s*P0001:\s*/, '')
    .replace(/\nCONTEXT[\s\S]*$/, '')
  return txt.trim()
}

console.log('=== ANTES del deploy')
console.log('  sobre sin fila previa (2362):  ' + await probar(198, 2362, 999949))
console.log('  sobre con fila previa (4267):  ' + await probar(198, 4267, 999949))

const dep = await q(fs.readFileSync('temp_sql/143_guard_base_cero.sql','utf8'))
if (!dep.ok) throw new Error('no se pudo desplegar 143: ' + JSON.stringify(dep.j).slice(0,300))
console.log('\n=== 143 desplegado')

console.log('\n=== DESPUES del deploy')
const a = await probar(198, 2362, 999949)
const b = await probar(198, 4267, 999949)
console.log('  sobre sin fila previa (2362):  ' + a)
console.log('  sobre con fila previa (4267):  ' + b)
const c = await probar(198, 2362, 50)
console.log('  monto chico con saldo negativo: ' + c)

const ok = a.includes('RECHAZADO') && b.includes('RECHAZADO') && c.includes('RECHAZADO')
console.log(ok ? '\nVERIFICADO: la guarda ya no se saltea sin fila previa' : '\nFALLA: revisar')
