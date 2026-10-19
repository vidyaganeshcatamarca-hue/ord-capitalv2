// Smoke 79: mapa del user 198 = ARS + CHF (elegida), SIN USD fantasma.
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
const r = await q("SELECT set_config('request.jwt.claims', '{\"sub\":\"5e70854e-8cfa-4b0e-946d-64a055cc29c3\",\"role\":\"authenticated\"}', true) AS claims, public.fn_obtener_formato_moneda() AS mapa_198");
console.log(JSON.stringify(r));
