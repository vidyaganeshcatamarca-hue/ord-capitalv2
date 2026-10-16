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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,400));
  return json;
};
console.log(JSON.stringify(await q("SELECT (SELECT count(*) FROM public.p_billeteras WHERE nombre LIKE 'probe%') AS probes_bil, (SELECT count(*) FROM public.p_caja WHERE metadata::text LIKE '%s17%') AS probes_caja, (SELECT count(*) FROM public.p_caja_cuarentena WHERE metadata::text LIKE '%s17%') AS probes_pend, (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_titulo_transferencia') AS helper_en_vivo")));
