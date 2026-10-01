const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_schema='public' AND table_name = 'p_estructuras_egresos';");
  const rows = Array.isArray(r) ? r : [];
  console.log(rows[0].cols);
  const r2 = await q("SELECT count(*) FILTER (WHERE nombre_cuenta LIKE 'cat_%') AS keys, count(*) AS total, string_agg(DISTINCT nombre_cuenta, ' | ') AS nombres FROM p_estructuras_egresos WHERE user_id = 1;");
  console.log(JSON.stringify(r2));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
