// Read-only: modo app config (global, flags, usuarios)
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
  const g = await q('SELECT * FROM app_global_config LIMIT 3;');
  console.log('=== app_global_config ===');
  console.log(JSON.stringify(g, null, 2));

  const f = await q('SELECT feature_key, required_mode, activo FROM app_feature_flags ORDER BY required_mode, feature_key;');
  console.log('=== app_feature_flags ===');
  console.log(JSON.stringify(f, null, 2));

  const u = await q('SELECT um.user_id, um.modo_app, u.nombre, u.email FROM user_modo_app um LEFT JOIN usuarios u ON u.user_id = um.user_id ORDER BY u.email;');
  console.log('=== user_modo_app (con identidad) ===');
  console.log(JSON.stringify(u, null, 2));

  const s = await q(`SELECT count(*) AS total_usuarios, count(*) FILTER (WHERE um.modo_app = 'avanzado') AS en_avanzado FROM user_modo_app um;`);
  console.log(JSON.stringify(s, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
