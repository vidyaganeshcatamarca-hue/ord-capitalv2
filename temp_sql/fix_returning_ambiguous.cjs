// Fix del bug raiz: RETURNING pendiente_id ambiguous (4 sitios) + revertir DEBUG
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
  const d = await q("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_cargar_movimientos_voz' AND pronamespace = 'public'::regnamespace;");
  let def = (d[0].def || '').split('\r\n').join('\n');

  // 1. Revertir el DEBUG del handler
  const oldDebug = "            v_error_key := 'DEBUG: ' || SQLERRM;";
  if (def.split(oldDebug).length - 1 !== 1) { console.error('ABORT debug key'); process.exit(1); }
  def = def.split(oldDebug).join("            v_error_key := 'error_voice_parse_failed';");

  // 2. Calificar TODOS los RETURNING pendiente_id (4 sitios)
  const oldRet = 'RETURNING pendiente_id INTO v_pending_id';
  const newRet = 'RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id';
  const sites = def.split(oldRet).length - 1;
  console.log('RETURNING ambiguous encontrados:', sites);
  if (sites !== 4) { console.error('ABORT: se esperaban 4'); process.exit(1); }
  def = def.split(oldRet).join(newRet);

  fs.writeFileSync('temp_sql/voice_fn_cargar_final.sql', def);
  console.log('surgery OK (debug revertido + 4 RETURNING calificados)');

  const r1 = await q(def);
  console.log('fn aplicada:', JSON.stringify(r1));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
