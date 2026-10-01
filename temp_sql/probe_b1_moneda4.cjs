// Probe B1-4: default de p_caja.moneda + como inserta moneda el flujo pago_tarjeta (fn_registrar_pago_tarjeta)
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
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const parts = [
    "DO $p$ DECLARE s TEXT;",
    "BEGIN",
    "SELECT 'DEF-MONEDA: ' || coalesce(column_default, '<sin default>') || ' NULLABLE=' || is_nullable INTO s",
    "FROM information_schema.columns WHERE table_schema='public' AND table_name='p_caja' AND column_name='moneda';",

    "RAISE EXCEPTION 'TEST_PROBE4: %', s;",
    "END $p$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('TEST_PROBE4: ');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 500) : 'respuesta: ' + s.slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });