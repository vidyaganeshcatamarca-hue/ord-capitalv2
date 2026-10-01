// Completa la secuencia interrumpida: update voz + constraint limpio + verificacion
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
  let r = await q("UPDATE public.p_caja_cuarentena SET origen = 'voz' WHERE origen = 'api_banco' RETURNING pendiente_id;");
  console.log('1 update voz -> ' + JSON.stringify(r));

  r = await q("ALTER TABLE public.p_caja_cuarentena ADD CONSTRAINT p_caja_cuarentena_origen_check CHECK (origen = ANY (ARRAY['recurrente'::text, 'ocr'::text, 'voz'::text]));");
  console.log('2 add constraint -> ' + JSON.stringify(r));

  r = await q("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.p_caja_cuarentena'::regclass AND conname = 'p_caja_cuarentena_origen_check';");
  console.log('check final -> ' + JSON.stringify(r));

  r = await q("SELECT origen, count(*) AS n, count(*) FILTER (WHERE metadata ? 'job_id') AS con_job_id FROM public.p_caja_cuarentena GROUP BY origen ORDER BY n DESC;");
  console.log('distribucion final -> ' + JSON.stringify(r));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });