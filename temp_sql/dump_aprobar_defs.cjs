// Dump de las defs vivas de fn_aprobar_cuarentena y fn_aprobar_gastos_cuarentena_lote
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT p.proname, p.oid, pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname IN ('fn_aprobar_cuarentena', 'fn_aprobar_gastos_cuarentena_lote') ORDER BY p.proname, p.oid;");
  const rows = Array.isArray(r) ? r : [];
  rows.forEach((row) => {
    console.log('========== ' + row.proname + ' (oid ' + row.oid + ') ==========');
    console.log(String(row.def).split('\r\n').join('\n'));
    console.log('');
  });
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
