import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const sql = fs.readFileSync('temp_sql/113_detalle_con_billetera.sql','utf8')

const ensayo = await q(`BEGIN;
${sql}
CREATE TEMP TABLE zz (caso text, ok boolean, detalle text) ON COMMIT DROP;
DO $p$
DECLARE v_uid uuid; v_j jsonb;
BEGIN
  SELECT auth_id INTO v_uid FROM public.usuarios WHERE user_id = 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  v_j := public.fn_reporte_detalle_inversion(1);
  INSERT INTO zz VALUES ('devuelve billetera_origen_id', v_j ? 'billetera_origen_id', coalesce(v_j->>'billetera_origen_id','NULL'));
  INSERT INTO zz VALUES ('conserva el resto del contrato',
      (v_j ? 'monto_invertido_original') AND (v_j ? 'valor_actual_teorico') AND (v_j ? 'historial') AND (v_j ? 'estado_inversion'),
      left(v_j::text, 70));
END
$p$;
SELECT caso, ok, detalle FROM zz;
ROLLBACK;`)
if (!Array.isArray(ensayo)) { console.log('✗ ensayo: ' + JSON.stringify(ensayo).slice(0,300)); process.exit(1) }
let f = 0
for (const r of ensayo) { if (!r.ok) f++; console.log((r.ok?'  ✓ ':'  ✗ ') + r.caso + '  [' + r.detalle + ']') }
if (f) { console.log('✗ no se aplica'); process.exit(1) }

const res = await q(`BEGIN;\n${sql}\nCOMMIT;`)
if (res?.message) { console.log('✗ 113 falló: ' + res.message); process.exit(1) }
console.log('✓ 113 aplicada')
const check = await q(`select pg_get_functiondef(oid) like '%''billetera_origen_id'', v_inversion.billetera_origen_id%' as con_clave from pg_proc where proname='fn_reporte_detalle_inversion'`)
console.log('POSTCHECK ' + JSON.stringify(check))
