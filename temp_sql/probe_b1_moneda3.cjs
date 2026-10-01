// Probe B1-3: columnas de p_tarjetas_credito + tarjeta 9 + p_caja 4400 moneda + nulls
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
    "DO $p$ DECLARE r RECORD; s TEXT;",
    "BEGIN",
    "SELECT 'COLS-TARJETAS: ' || string_agg(column_name, ',' ORDER BY ordinal_position) INTO s",
    "FROM information_schema.columns WHERE table_schema='public' AND table_name='p_tarjetas_credito';",
    "SELECT s || ' TARJ9: ' || coalesce(tc.banco, '<sin banco>') INTO s FROM public.p_tarjetas_credito tc WHERE tc.tarjeta_id = 9;",
    "IF s NOT LIKE '%TARJ9%' THEN s := s || ' TARJ9: SIN'; END IF;",
    "SELECT s || ' CAJA4400: moneda=' || coalesce(p.moneda::text, '<NULL>') || ' es_usd=' || p.es_usd INTO s FROM public.p_caja p WHERE p.p_caja_id = 4400;",
    "RAISE EXCEPTION 'TEST_PROBE3: %', s;",
    "END $p$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('TEST_PROBE3: ');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 1200) : 'respuesta: ' + s.slice(0, 500));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });