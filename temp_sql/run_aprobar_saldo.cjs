// Ejecuta el test DO-block via Management API (sin regex con backslashes)
const fs = require('fs');
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
const sql = fs.readFileSync('temp_sql/test_aprobar_saldo.sql', 'utf8');
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q(sql);
  const s = JSON.stringify(r);
  console.log('respuesta: ' + s.slice(0, 600));
  const iPass = s.indexOf('TEST_RESULT');
  if (iPass >= 0) {
    const end = s.indexOf('"', iPass);
    console.log('=== ' + s.slice(iPass, end < 0 ? iPass + 40 : end) + ' ===');
  }
  const iFail = s.indexOf('TEST_FAIL');
  if (iFail >= 0) {
    const end = s.indexOf('"', iFail);
    console.log('=== ' + s.slice(iFail, end < 0 ? iFail + 80 : end) + ' ===');
    process.exit(1);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
