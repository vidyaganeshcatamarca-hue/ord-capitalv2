// Probe B1-2: p_caja.moneda de la fila 4400 + moneda de la tarjeta 9 + conteo de NULL
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
    "SELECT p.p_caja_id, p.tipo, p.moneda::text, p.es_usd, p.tarjeta_id INTO s FROM public.p_caja p WHERE p.p_caja_id = 4400;",
    "s := COALESCE(s, 'SIN-4400');",
    "SELECT ' TARJ9: ' || json_build_object('id', tc.tarjeta_id, 'nombre', tc.nombre, 'moneda', tc.moneda)::text INTO s FROM public.p_tarjetas_credito tc WHERE tc.tarjeta_id = 9;",
    "IF s NOT LIKE '%TARJ9%' THEN s := s || ' TARJ9: SIN'; END IF;",
    "SELECT ' NULLS: exp=' || count(*) FILTER (WHERE p.tipo = 'expense' AND p.moneda IS NULL) ||",
    " ' pag=' || count(*) FILTER (WHERE p.tipo = 'pago_tarjeta' AND p.moneda IS NULL) ||",
    " ' inc=' || count(*) FILTER (WHERE p.tipo = 'income' AND p.moneda IS NULL) ||",
    " ' tr=' || count(*) FILTER (WHERE p.tipo = 'transfer' AND p.moneda IS NULL) INTO s",
    "FROM public.p_caja p;",
    "SELECT ' TODOS_MONEDA=' || string_agg(DISTINCT COALESCE(p.moneda, '<NULL>'), ',') INTO s FROM public.p_caja p;",
    "RAISE EXCEPTION 'TEST_PROBE2: %', s;",
    "END $p$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('TEST_PROBE2: ');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 900) : 'respuesta: ' + s.slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });