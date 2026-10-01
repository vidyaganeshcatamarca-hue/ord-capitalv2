// Re-ejecuta las 2 CREATE OR REPLACE del SQL parcheado
const fs = require('fs');
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
const all = fs.readFileSync('temp_sql/aprobar_saldo_patched.sql', 'utf8');
const stmts = all.split(/\n\n(?=CREATE OR REPLACE)/).filter(Boolean);
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  for (let i = 0; i < stmts.length; i++) {
    const r = await q(stmts[i]);
    const s = JSON.stringify(r);
    console.log('statement ' + (i + 1) + ' -> ' + (s.length < 150 ? s : s.slice(0, 150)));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
