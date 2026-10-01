// Esquema real de p_caja y p_gastos_recurrentes
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
  const r = await q(
    "SELECT table_name, column_name, data_type FROM information_schema.columns" +
    " WHERE table_schema='public' AND table_name IN ('p_caja','p_gastos_recurrentes')" +
    " ORDER BY table_name, ordinal_position;"
  );
  console.log(JSON.stringify(r, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });