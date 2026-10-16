// Dump read-only de los cuerpos vivos que T3/S17 parchea (para 75_genera).
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,500));
  return json;
};
for (const f of ['fn_registrar_movimiento_caja','fn_aprobar_cuarentena_v2']) {
  const r = await q("SELECT pg_get_functiondef(p.oid) AS def, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='"+f+"'");
  fs.writeFileSync('temp_sql/75_dump_'+f+'.mjs.tmp', JSON.stringify(r, null, 1));
  console.log(f, 'dumped, args:', r[0].args);
}
