// Driver regla 11: crear runner, ejecutar, borrar
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
  const runnerSql = fs.readFileSync('temp_sql/voice_cargar_test_runner.sql', 'utf8');
  const c = await q(runnerSql);
  console.log('1) crear runner:', JSON.stringify(c));

  const r = await q('SELECT public.fn_run_voice_cargar_test() AS res; ROLLBACK;');
  console.log('2) ejecutar:');
  console.log(JSON.stringify(r, null, 2));

  const d = await q('DROP FUNCTION IF EXISTS public.fn_run_voice_cargar_test();');
  console.log('3) drop runner:', JSON.stringify(d));

  const v = await q("SELECT count(*) AS quedan FROM pg_proc WHERE proname = 'fn_run_voice_cargar_test';");
  console.log('4) runner borrado (debe ser 0):', JSON.stringify(v));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
