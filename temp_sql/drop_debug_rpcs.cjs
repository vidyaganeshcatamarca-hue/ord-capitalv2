// DROP de RPCs de debug que quedaron vivas (autorizado por el dueno)
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
  // ver antes: las defs (por si hay overloads)
  let r = await q("SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('fn_debug_triggers','fn_debug_get_source');");
  console.log('antes -> ' + JSON.stringify(r));
  const rows = Array.isArray(r) ? r : [];
  for (const row of rows) {
    const d = await q('DROP FUNCTION public.' + row.proname + '(' + row.args + ');');
    console.log('drop ' + row.proname + '(' + row.args + ') -> ' + JSON.stringify(d));
  }
  r = await q("SELECT proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (p.proname ILIKE '%debug%' OR p.proname ILIKE '%temp%');");
  console.log('despues -> ' + JSON.stringify(r));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });