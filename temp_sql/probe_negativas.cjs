// Evidencia: wallets negativas AHORA + el ultimo gasto que las dejo ahi
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
    "SELECT b.billetera_id, b.nombre, b.saldo_actual, b.moneda," +
    "  (SELECT c.p_caja_id FROM public.p_caja c WHERE c.billetera_origen_id = b.billetera_id ORDER BY c.p_caja_id DESC LIMIT 1) AS ultimo_mov_id," +
    "  (SELECT c.tipo FROM public.p_caja c WHERE c.billetera_origen_id = b.billetera_id ORDER BY c.p_caja_id DESC LIMIT 1) AS ultimo_tipo," +
    "  (SELECT left(COALESCE(c.detalle, ''), 40) FROM public.p_caja c WHERE c.billetera_origen_id = b.billetera_id ORDER BY c.p_caja_id DESC LIMIT 1) AS ultimo_detalle," +
    "  (SELECT c.creado_at FROM public.p_caja c WHERE c.billetera_origen_id = b.billetera_id ORDER BY c.p_caja_id DESC LIMIT 1) AS ultimo_momento" +
    " FROM public.p_billeteras b WHERE b.user_id = 1 AND b.saldo_actual < 0;"
  );
  console.log(JSON.stringify(r, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });