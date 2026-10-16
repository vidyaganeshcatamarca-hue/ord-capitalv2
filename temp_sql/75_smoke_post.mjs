// Smoke post-deploy T3/S17: helper en vivo (lectura pura, sin writes).
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
const casos = [
  ["ARS","USD","ARS"], ["USD","ARS","ARS"], ["ARS","EUR","ARS"], ["EUR","ARS","ARS"],
  ["USD","GBP","ARS"], ["GBP","USD","ARS"], ["ARS","ARS","ARS"], ["ARS","EUR",null],
];
for (const [o,d,l] of casos) {
  const r = await q(`SELECT public.fn_titulo_transferencia('${o}','${d}',${l === null ? 'NULL' : `'${l}'`}) AS titulo;`);
  console.log(`${o}->${d} (local=${l}):`, r[0].titulo);
}
