// Read-only: logica viva de las 3 fns + datos reales
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
  const d = await q("SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_obtener_modo_app' AND pronamespace = 'public'::regnamespace;");
  console.log('=== fn_obtener_modo_app (VIVA) ===');
  console.log(d[0].def);

  const f = await q('SELECT feature_key, modo_minimo, activo, orden FROM app_feature_flags ORDER BY orden;');
  console.log('=== app_feature_flags (datos) ===');
  console.log(JSON.stringify(f, null, 2));

  const u = await q('SELECT user_id, nombre, email, modo_app FROM usuarios ORDER BY email;');
  console.log('=== usuarios (modo_app) ===');
  console.log(JSON.stringify(u, null, 2));

  const a = await q("SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_activar_modo_avanzado' AND pronamespace = 'public'::regnamespace;");
  console.log('=== fn_activar_modo_avanzado (VIVA) ===');
  console.log(a[0].def);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
