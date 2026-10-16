// Smoke post-deploy 77+78: solo lectura.
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,600));
  return json;
};
const perm = await q("SELECT has_function_privilege('authenticated', 'public.fn_obtener_divisas_cotizadas()', 'execute') AS divisas_ok, has_function_privilege('authenticated', 'public.fn_obtener_formato_moneda()', 'execute') AS fm_ok, has_function_privilege('authenticated', 'public.fn_configurar_formato_moneda(text,smallint,text,text)', 'execute') AS cf_ok");
console.log('permisos authenticated:', JSON.stringify(perm));
const cat = await q("SELECT array_length(public.fn_obtener_divisas_cotizadas(),1) AS n_monedas, 'USD' = ANY(public.fn_obtener_divisas_cotizadas()) AS usd_presente");
console.log('catalogo:', JSON.stringify(cat));
const u = await q("SELECT auth_id FROM public.usuarios WHERE auth_id IS NOT NULL ORDER BY user_id LIMIT 1");
console.log('mapa formato (user1, ARS):', JSON.stringify(await q(`SELECT set_config('request.jwt.claims', '{"sub":"${u[0].auth_id}","role":"authenticated"}', true), public.fn_obtener_formato_moneda();`)));
