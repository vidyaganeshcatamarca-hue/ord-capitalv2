// Movimientos de hoy en Efectivo (columnas reales) + recurrentes activas
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
    "SELECT p_caja_id, tipo, valor_egreso, valor_ingreso, fecha, left(COALESCE(detalle,''),50) AS det," +
    " left(COALESCE(nombre_cuenta_historico,''),30) AS hist, estructura_egreso_id, metadata, creado_at" +
    " FROM public.p_caja WHERE billetera_origen_id = 2 AND creado_at >= '2026-09-28 19:00:00+00'" +
    " ORDER BY p_caja_id DESC LIMIT 10;"
  );
  console.log('=== movimientos de hoy en Efectivo ===');
  console.log(JSON.stringify(r, null, 1));

  const r2 = await q(
    "SELECT recurrente_id, tipo_variabilidad, monto_base, activo, frecuencia, left(COALESCE(nombre_custom,''),30) AS nombre, billetera_defecto_id" +
    " FROM public.p_gastos_recurrentes WHERE user_id = 1 ORDER BY activo DESC, recurrente_id DESC LIMIT 8;"
  );
  console.log('=== recurrentes ===');
  console.log(JSON.stringify(r2, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });