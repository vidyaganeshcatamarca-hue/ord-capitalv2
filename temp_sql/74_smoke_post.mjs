// Smoke post-deploy T1 (v2): cada consulta por separado (el API devuelve solo el ultimo result set). Solo lectura.
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
const u = await q("SELECT u.auth_id, u.user_id, (SELECT r.moneda_default FROM public.p_config_region r WHERE r.user_id = u.user_id) AS local FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1");
const authId = u[0].auth_id;
const claims = `SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);`;
console.log('usuario probe:', JSON.stringify(u[0]));
console.log('extras:', JSON.stringify(await q(claims + ' SELECT public.fn_obtener_monedas_extra();')));
console.log('cot ARS->USD:', JSON.stringify(await q("SELECT c.cotizacion, c.fecha FROM public.fn_obtener_cotizacion('ARS','USD') c;")));
console.log('cot EUR->GBP:', JSON.stringify(await q("SELECT c.cotizacion, c.fecha FROM public.fn_obtener_cotizacion('EUR','GBP') c;")));
console.log('cot ZZZ->USD (D17):', JSON.stringify(await q("SELECT c.cotizacion, c.fecha FROM public.fn_obtener_cotizacion('ZZZ','USD') c;")));
