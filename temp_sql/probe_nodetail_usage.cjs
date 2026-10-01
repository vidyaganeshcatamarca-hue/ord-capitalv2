const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  // cuantas filas no_detail hay y cuantos gastos apuntan a ellas
  const r = await q("WITH nd AS (SELECT e.estructura_id, e.padre_id, p.nombre_cuenta AS rubro FROM public.p_estructuras_egresos e JOIN public.p_estructuras_egresos p ON p.estructura_id = e.padre_id WHERE e.user_id = 1 AND e.nombre_cuenta = 'no_detail') SELECT nd.rubro, nd.estructura_id AS nd_id, (SELECT count(*) FROM public.p_caja c WHERE c.estructura_egreso_id = nd.estructura_id) AS gastos_apuntando FROM nd ORDER BY gastos_apuntando DESC;");
  console.log(JSON.stringify(r, null, 1));
  // gastos directos a nivel padre (el caso que no_detail deberia representar)
  const r2 = await q("SELECT count(*) AS gastos_en_padres FROM public.p_caja c JOIN public.p_estructuras_egresos e ON e.estructura_id = c.estructura_egreso_id WHERE c.user_id = 1 AND c.estructura_egreso_id IS NOT NULL AND e.padre_id IS NULL;");
  console.log(JSON.stringify(r2));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
