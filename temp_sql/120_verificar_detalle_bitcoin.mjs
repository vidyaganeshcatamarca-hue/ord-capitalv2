import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const r = await q(`DO $$ DECLARE v_uid uuid; BEGIN
  SELECT auth_id INTO v_uid FROM public.usuarios WHERE user_id = 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
END $$;
SELECT public.fn_reporte_detalle_inversion(1) AS detalle;`)
const d = r?.[0]?.detalle
if (!d) { console.log('RESPUESTA ' + JSON.stringify(r).slice(0, 200)); process.exit(0) }
console.log('capital            ' + d.monto_invertido_original)
console.log('valor de mercado   ' + d.valor_mercado_actual)
console.log('retirado           ' + d.monto_liquidado)
console.log('rendimiento nominal ' + d.rendimiento_nominal)
console.log('rendimiento real   ' + d.rendimiento_real)
console.log('historial          ' + (d.historial || []).map(h => h.detalle + ' ' + h.monto).join(' | '))
