// Sondeo 80: estructura de p_divisas y muestra de filas (names y relación con el código).
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0,500));
  return json;
};
const cols = await q("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='p_divisas' ORDER BY ordinal_position");
console.log('cols:', cols.map(c=>`${c.column_name}:${c.data_type}`).join(', '));
const sample = await q("SELECT * FROM public.p_divisas ORDER BY divisa_id LIMIT 8");
console.log('sample rows:', JSON.stringify(sample));
