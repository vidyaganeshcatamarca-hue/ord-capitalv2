// E2E data check post-fix (read-only)
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';

function q(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: '/v1/projects/' + REF + '/database/query',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.ACCESS_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(out)); } catch (e) { resolve(out); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  // 1. Lo que vera fn_reporte (post-fix): filas pendientes de CUALQUIER origen
  const r1 = await q("SELECT pendiente_id, origen, tipo, metadata->>'job_id' AS job_id FROM p_caja_cuarentena WHERE estado = 'pendiente';");
  console.log('=== fn_reporte (post-fix) devolveria ===');
  console.log(JSON.stringify(r1, null, 2));

  // 2. El discriminador del FAB: items de voz pendientes
  const r2 = await q("SELECT count(*) AS voice_pending FROM p_caja_cuarentena WHERE estado = 'pendiente' AND metadata->>'job_id' IS NOT NULL;");
  console.log('=== voice_pending (FAB count) ===');
  console.log(JSON.stringify(r2, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
