// Deploy REAL de 77 + 78 (aprobado por el dueno 2026-10-16).
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
for (const f of ['77_deploy_divisas_cotizadas.sql', '78_deploy_formato_moneda.sql']) {
  const ddl = fs.readFileSync('temp_sql/' + f, 'utf-8');
  console.log('deploy', f, '...');
  await q(ddl);
  console.log(f, 'aplicado');
}
// Verificacion post-deploy (solo lectura)
const v = await q("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_obtener_divisas_cotizadas','fn_configurar_formato_moneda','fn_obtener_formato_moneda') ORDER BY 1");
console.log('funciones:', JSON.stringify(v));
const col = await q("SELECT column_name, column_default FROM information_schema.columns WHERE table_name='p_config_region' AND column_name='monedas_formateo'");
console.log('columna monedas_formateo:', JSON.stringify(col));
