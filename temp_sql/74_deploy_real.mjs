// Deploy REAL de T1 monedas extra (aprobado por el dueno 2026-10-16).
// Requiere: node --env-file=.env.local temp_sql/74_deploy_real.mjs
import fs from 'node:fs'
const env = {};
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0];
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer '+env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,800));
  return json;
};
const ddl = fs.readFileSync('temp_sql/74_deploy_monedas_extra.sql','utf-8');
console.log('deploy REAL... (aprobado por el dueno)');
await q(ddl);
console.log('deploy REAL aplicado');

// Verificacion post-deploy (solo lectura)
const v1 = await q("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='p_config_region' AND column_name='monedas_extra'");
console.log('columna:', JSON.stringify(v1));
const v2 = await q("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_userbyid(p.proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_obtener_monedas_extra','fn_configurar_monedas_extra','fn_obtener_cotizacion') ORDER BY 1");
console.log('funciones:', JSON.stringify(v2));
const v3 = await q("SELECT count(*) FROM (SELECT DISTINCT proargtypes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_crear_billetera') t");
console.log('overloads de fn_crear_billetera (firma unica esperada):', JSON.stringify(v3));
const v4 = await q("SELECT distribucion_monedas FROM (SELECT monedas_extra::text AS distribucion_monedas, count(*) FROM public.p_config_region GROUP BY 1) t");
console.log('extras por usuario tras default:', JSON.stringify(v4.slice(0,5)));
