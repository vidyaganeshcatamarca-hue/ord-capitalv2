// Raw truth for fn_reporte_cuarentena_pendients (read-only)
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
          try { resolve(JSON.parse(out)); } catch { resolve(out); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const r = await q("SELECT p.oid, p.proname, p.prokind, p.pronamespace::regnamespace AS schema, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname LIKE 'fn_reporte%';");
  console.log(JSON.stringify(r, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
