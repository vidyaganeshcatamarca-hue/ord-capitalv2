// Read-only: filas de voz en cuarentena (metadata.job_id)
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT pendiente_id, user_id, origen, tipo, estado, monto, detalle, metadata->>'job_id' AS job_id, metadata->>'parse_error' AS parse_error, creado_at FROM p_caja_cuarentena ORDER BY creado_at DESC LIMIT 10;");
  console.log('=== ultimas filas de p_caja_cuarentena ===');
  console.log(JSON.stringify(r, null, 2));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
