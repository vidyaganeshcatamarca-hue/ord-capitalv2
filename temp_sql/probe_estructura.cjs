const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('estructura','estructura_categorias','p_billeteras') GROUP BY table_name;");
  const rows = Array.isArray(r) ? r : [];
  rows.forEach((row) => console.log('== ' + row.table_name + ' ==\n' + row.cols + '\n'));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
