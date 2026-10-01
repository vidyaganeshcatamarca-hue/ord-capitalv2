// Aplica fn_reporte_movimientos_recientes via DROP + CREATE (cambio de RETURNS)
const https = require('https');
const fs = require('fs');
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
  const create = fs.readFileSync('temp_sql/reporte_es_usd.sql', 'utf8').trim();
  const drop = 'DROP FUNCTION IF EXISTS public.fn_reporte_movimientos_recientes(' +
    'p_limit integer, p_offset integer, p_filtro_tipo text, p_billetera_id bigint, ' +
    'p_fecha_inicio date, p_fecha_fin date, p_tarjeta_id bigint);';
  const r1 = await q(drop);
  console.log('drop ->', JSON.stringify(r1).slice(0, 100));
  const r2 = await q(create);
  console.log('create ->', JSON.stringify(r2).slice(0, 100));
  // sanity: firma y es_usd en la definicion viva
  const chk = await q(
    "SELECT length(prosrc) FROM pg_proc p WHERE p.proname = 'fn_reporte_movimientos_recientes';"
  );
  console.log('def viva ->', JSON.stringify(chk).slice(0, 200));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });