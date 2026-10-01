// Aplica las 2 funciones B1 (v2 moneda + reporte es_usd) via Management API
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
  const sql1 = fs.readFileSync('temp_sql/v2_moneda_fixed.sql', 'utf8');
  const sql2 = fs.readFileSync('temp_sql/reporte_es_usd.sql', 'utf8');
  console.log('v2 ->', JSON.stringify(await q(sql1)).slice(0, 120));
  console.log('reporte ->', JSON.stringify(await q(sql2)).slice(0, 120));

  // espejos
  fs.writeFileSync('funcionesSQL/fn_aprobar_cuarentena_v2.md', sql1.trim() + '\n');
  fs.writeFileSync('funcionesSQL/fn_reporte_movimientos_recientes.md', sql2.trim() + '\n');
  console.log('espejos OK');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });