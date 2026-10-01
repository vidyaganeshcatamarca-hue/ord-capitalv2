// Exact inventory for fn_reporte_cuarentena* (read-only)
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
        res.on('end', () => {
          try { resolve(JSON.parse(out)); } catch { resolve(out); }
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
    "SELECT proname, prokind, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname LIKE 'fn_reporte_cuarentena%' AND pronamespace = 'public'::regnamespace;"
  );
  const rows = Array.isArray(r) ? r : [];
  for (const row of rows) {
    const def = row.def || '';
    console.log('=== ' + JSON.stringify(row.proname) + ' (prokind: ' + row.prokind + ', def: ' + (row.def === null ? 'NULL' : def.length + ' chars') + ') ===');
    if (def) {
      def.split('\n').forEach((l, i) => {
        if (/'pending'|'pendiente'/.test(l)) console.log('  ' + (i + 1) + ': ' + l.trim());
      });
    }
  }
  // Guardar la def cruda para editar con precision
  fs.writeFileSync('temp_sql/voice_v1_reporte_live.json', JSON.stringify(rows, null, 2));
  console.log('=== guardado: temp_sql/voice_v1_reporte_live.json ===');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
