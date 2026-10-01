// Probe B1: fila de cuarentena del gasto 150 (Ashram card) + p_caja es_usd + wallet moneda
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
    "SELECT json_agg(json_build_object('id', b.billetera_id, 'nombre', b.nombre, 'moneda', b.moneda, 'saldo', b.saldo_actual))::text INTO s",
    "FROM public.p_billeteras b WHERE b.nombre ILIKE '%ashram%';",
    "s := COALESCE(s, 'SIN-WALLET');",
    "FOR r IN SELECT pendiente_id, tipo, monto, moneda, billetera_id, billetera_destino_id, tarjeta_id, estado, metadata",
    "FROM public.p_caja_cuarentena WHERE monto IN (150) ORDER BY pendiente_id DESC LIMIT 5 LOOP",
    "s := s || E'\\nCUREN: ' || json_build_object('pid', r.pendiente_id, 'tipo', r.tipo, 'monto', r.monto, 'moneda', r.moneda, 'bil', r.billetera_id, 'dest', r.billetera_destino_id, 'tarj', r.tarjeta_id, 'estado', r.estado, 'meta', r.metadata)::text;",
    "END LOOP;",
    "FOR r IN SELECT p.p_caja_id, p.tipo, p.valor_egreso, p.valor_ingreso, p.es_usd, p.detalle, p.metadata, p.tarjeta_id",
    "FROM public.p_caja p WHERE p.valor_egreso IN (150) ORDER BY p.p_caja_id DESC LIMIT 5 LOOP",
    "s := s || E'\\nCAJA: ' || json_build_object('id', r.p_caja_id, 'tipo', r.tipo, 'eg', r.valor_egreso, 'in', r.valor_ingreso, 'es_usd', r.es_usd, 'detalle', r.detalle, 'tarj', r.tarjeta_id, 'meta', r.metadata)::text;",
    "END LOOP;",
    "RAISE EXCEPTION 'TEST_PROBE: %', s;",
    "END $p$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('TEST_PROBE: ');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 2600) : 'respuesta: ' + s.slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });