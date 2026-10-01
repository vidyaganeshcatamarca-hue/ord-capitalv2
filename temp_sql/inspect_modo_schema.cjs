// Read-only: esquema real de flags y tabla con modo_app
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
  const c = await q("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name = 'app_feature_flags' AND table_schema = 'public' ORDER BY ordinal_position;");
  console.log('=== columnas reales de app_feature_flags ===');
  console.log(JSON.stringify(c, null, 2));

  const t = await q("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE column_name = 'modo_app' AND table_schema = 'public' ORDER BY table_name;");
  console.log('=== tablas con columna modo_app ===');
  console.log(JSON.stringify(t, null, 2));

  const fn = await q("SELECT p.proname, (p.prosrc LIKE '%user_modo_app%') AS usa_user_modo_app, (p.prosrc LIKE '%app_feature_flags%') AS usa_flags FROM pg_proc p WHERE p.proname IN ('fn_obtener_modo_app','fn_activar_modo_avanzado','fn_desactivar_modo_avanzado') AND p.pronamespace = 'public'::regnamespace;");
  console.log('=== que tablas usa realmente cada fn ===');
  console.log(JSON.stringify(fn, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
