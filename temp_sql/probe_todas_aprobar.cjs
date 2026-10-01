const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (p.proname ILIKE '%aprobar%' OR p.proname ILIKE '%cuarentena%' OR p.proname ILIKE '%saneamiento%') ORDER BY p.proname, p.oid;");
  const rows = Array.isArray(r) ? r : [];
  rows.forEach((row) => console.log(row.oid + ' ' + row.proname + '(' + row.args + ')'));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
