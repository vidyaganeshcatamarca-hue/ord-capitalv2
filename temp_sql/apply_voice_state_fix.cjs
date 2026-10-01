// Apply the 3 authorized fixes to live Supabase functions (write)
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

const reporteLive = JSON.parse(fs.readFileSync('temp_sql/voice_v1_reporte_live.json', 'utf8'))[0].def;
const otherLive = JSON.parse(fs.readFileSync('temp_sql/voice_v1_live_defs.json', 'utf8'));

const fixes = {};

// Fix 1: fn_reporte_cuarentena_pendients — estado 'pending' -> 'pendiente'
const before1 = (reporteLive.match(/'pending'/g) || []).length;
fixes['fn_reporte_cuarentena_pendients'] = reporteLive.split("'pending'").join("'pendiente'");
const after1 = (fixes['fn_reporte_cuarentena_pendients'].match(/'pending'/g) || []).length;

// Fix 2: fn_rechazar_cuarentena — same
const rechazarLive = otherLive['fn_rechazar_cuarentena'];
const before2 = (rechazarLive.match(/'pending'/g) || []).length;
fixes['fn_rechazar_cuarentena'] = rechazarLive.split("'pending'").join("'pendiente'");
const after2 = (fixes['fn_rechazar_cuarentena'].match(/'pending'/g) || []).length;

// Fix 3: fn_cargar_movimientos_voz — persist ambiguous_matches in success metadata
const cargarLive = otherLive['fn_cargar_movimientos_voz'];
const OLD_META = "jsonb_build_object('job_id', p_job_id, 'movement_index', v_index)";
const NEW_META = "jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'ambiguous_matches', v_movement->'ambiguous_matches')";
const matches = cargarLive.split(OLD_META).length - 1;
if (matches !== 1) {
  console.error('ABORT: se esperaba 1 site del success-path metadata, hay ' + matches);
  process.exit(1);
}
fixes['fn_cargar_movimientos_voz'] = cargarLive.split(OLD_META).join(NEW_META);

console.log('fix 1 fn_reporte: pending antes=' + before1 + ' despues=' + after1);
console.log('fix 2 fn_rechazar: pending antes=' + before2 + ' despues=' + after2);
console.log('fix 3 fn_cargar: ambiguous_matches presente=' + fixes['fn_cargar_movimientos_voz'].includes("'ambiguous_matches'"));

(async () => {
  for (const name of Object.keys(fixes)) {
    const r = await q(fixes[name]);
    console.log('aplicado ' + name + ':', JSON.stringify(r));
  }
  console.log('=== verificacion post-fix (filtros en viva) ===');
  const verify = await q(
    "SELECT p.proname, position(\"'pending'\" in pg_get_functiondef(p.oid)) AS pos_pending_es, position(\"'pendiente'\" in pg_get_functiondef(p.oid)) AS pos_pendiente_es, pg_get_functiondef(p.oid) LIKE \"%ambiguous_matches%\" AS tiene_ambig FROM pg_proc p WHERE p.proname IN ('fn_reporte_cuarentena_pendients','fn_rechazar_cuarentena','fn_cargar_movimientos_voz') AND p.pronamespace = 'public'::regnamespace;"
  );
  console.log(JSON.stringify(verify, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
