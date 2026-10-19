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
// verificación inofensiva: el def vivo aún tiene el bloque fantasma (79 NO deployado)
const r = await q("SELECT pg_get_functiondef(p.oid) LIKE '%USD FANTASMA%' OR pg_get_functiondef(p.oid) LIKE '%USD cuando NO es la local%' AS fantasma_vivo, pg_get_functiondef(p.oid) LIKE '%solo monedas del usuario%' AS fix79_vivo FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_obtener_formato_moneda'");
console.log(JSON.stringify(r));
