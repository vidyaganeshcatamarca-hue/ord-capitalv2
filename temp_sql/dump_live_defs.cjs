// Live definitions dump for the 3 voice/cuarentena RPCs (read-only)
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
        res.on('data', (d) => (out += d));
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
  const defs = {};
  for (const fname of ['fn_reporte_cuarentena_pendients', 'fn_rechazar_cuarentena', 'fn_cargar_movimientos_voz']) {
    const r = await q(
      "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = '" + fname + "' AND p.pronamespace = 'public'::regnamespace;"
    );
    const arr = Array.isArray(r) ? r : [];
    if (arr[0] && arr[0].def) {
      defs[fname] = arr[0].def;
      const lines = arr[0].def.split('\n');
      console.log('=== ' + fname + ' (' + arr[0].def.length + ' chars) — lineas con pending/jsonb_build_object ===');
      lines.forEach((l, i) => {
        if (/'pending'|jsonb_build_object/.test(l)) console.log(i + 1 + ': ' + l.trim());
      });
    } else {
      console.log('=== ' + fname + ' — NO EXISTE EN VIVA ===');
    }
  }
  fs.writeFileSync('temp_sql/voice_v1_live_defs.json', JSON.stringify(defs, null, 2));
  console.log('=== defs completas guardadas en temp_sql/voice_v1_live_defs.json ===');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});