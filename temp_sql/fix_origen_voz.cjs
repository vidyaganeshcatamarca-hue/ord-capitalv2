// 1) borrar filas test del dueno (bloquean el swap), 2) api_banco -> voz,
// 3) constraint limpio (recurrente|ocr|voz), 4) fn_cargar_movimientos_voz honesta
const fs = require('fs');
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
  let r = await q("DELETE FROM public.p_caja_cuarentena WHERE pendiente_id IN (6,7,8) AND origen = 'api_banco' RETURNING pendiente_id;");
  console.log('1 delete test rows -> ' + JSON.stringify(r));

  r = await q("UPDATE public.p_caja_cuarentena SET origen = 'voz' WHERE origen = 'api_banco' RETURNING pendiente_id;");
  console.log('2 update voz -> ' + JSON.stringify(r));

  r = await q("ALTER TABLE public.p_caja_cuarentena DROP CONSTRAINT p_caja_cuarentena_origen_check;");
  console.log('3a drop -> ' + JSON.stringify(r));

  r = await q("ALTER TABLE public.p_caja_cuarentena ADD CONSTRAINT p_caja_cuarentena_origen_check CHECK (origen = ANY (ARRAY['recurrente'::text, 'ocr'::text, 'voz'::text]));");
  console.log('3b add -> ' + JSON.stringify(r));

  r = await q("SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'fn_cargar_movimientos_voz';");
  const rows = Array.isArray(r) ? r : [];
  let def = String(rows[0].def).split('\r\n').join('\n');
  const c = def.split("'api_banco'").length - 1;
  if (c !== 4) { console.error('ABORT fn_cargar: api_banco hay ' + c + ' (esperaba 4)'); process.exit(1); }
  def = def.split("'api_banco'").join("'voz'");
  r = await q(def);
  console.log('4 fn_cargar -> ' + JSON.stringify(r));

  r = await q("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.p_caja_cuarentena'::regclass AND conname = 'p_caja_cuarentena_origen_check';");
  console.log('check final -> ' + JSON.stringify(r));

  r = await q("SELECT origen, count(*) AS n FROM public.p_caja_cuarentena GROUP BY origen;");
  console.log('distribucion final -> ' + JSON.stringify(r));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });