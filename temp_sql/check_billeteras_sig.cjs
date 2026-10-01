const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, (p.prosrc LIKE '%por_uso%' OR p.prosrc LIKE '%uso%') AS ordena_por_uso FROM pg_proc p WHERE p.proname IN ('fn_obtener_billeteras_ordenadas','fn_obtener_billeteras_activas') AND p.pronamespace = 'public'::regnamespace;");
  console.log(JSON.stringify(r));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
