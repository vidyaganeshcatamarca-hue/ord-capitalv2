// Deploy REAL 79 (aprobado por el dueno 2026-10-16 con regla matizada).
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
const ddl = fs.readFileSync('temp_sql/79_deploy_formato_usuarios.sql','utf-8');
console.log('deploy 79...');
await q(ddl);
console.log('aplicado');
const r = await q("SELECT pg_get_functiondef(p.oid) LIKE '%USD default de segunda moneda cuando no%' AS con_regla_dueno FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_obtener_formato_moneda'");
console.log('def vivo con regla del dueno:', JSON.stringify(r));
