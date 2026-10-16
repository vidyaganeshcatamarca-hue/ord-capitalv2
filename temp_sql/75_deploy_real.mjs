// Deploy REAL de T3/S17 titulos dinamicos (aprobado por el dueno 2026-10-16).
import fs from 'node:fs'
const env = {};
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0];
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer '+env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }) });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,800));
  return json;
};
const ddl = fs.readFileSync('temp_sql/75_deploy_monedas_titulos.sql','utf-8');
console.log('deploy REAL...');
await q(ddl);
console.log('apply OK');

// Verificacion post-deploy (solo lectura)
const v1 = await q("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, (pg_get_functiondef(p.oid) LIKE '%fn_titulo_transferencia%') AS usa_helper FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_titulo_transferencia','fn_registrar_movimiento_caja','fn_aprobar_cuarentena_v2') ORDER BY 1");
console.log('funciones:', JSON.stringify(v1, null, 1));
