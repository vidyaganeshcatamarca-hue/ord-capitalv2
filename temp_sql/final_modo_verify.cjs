// Verify final: la fn viva tiene el override + flags que vera el usuario test
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
  const f = await q("SELECT (prosrc LIKE '%modo_avanzado_testing%') AS override_presente FROM pg_proc WHERE proname = 'fn_obtener_modo_app' AND pronamespace = 'public'::regnamespace;");
  console.log('=== fn viva con override ===');
  console.log(JSON.stringify(f));

  const cfg = await q("SELECT clave, valor FROM app_global_config WHERE clave IN ('modo_avanzado_habilitado','modo_avanzado_testing','modo_avanzado_testing_users') ORDER BY clave;");
  console.log('=== config final ===');
  console.log(JSON.stringify(cfg));

  const flags = await q("SELECT json_agg(feature_key ORDER BY orden) AS features_que_vera_el_test_user FROM app_feature_flags WHERE activo = TRUE AND (modo_minimo = 'simple' OR 'avanzado' = 'avanzado');");
  console.log('=== features en modo avanzado (incluye cuarentena?) ===');
  console.log(JSON.stringify(flags));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
