// Impacto real: gastos apuntando a rubros padre, divididos segun si el rubro tiene hijos
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
  const r = await q(
    "WITH padres AS (" +
    "  SELECT e.estructura_id, e.nombre_cuenta, e.padre_id IS NULL AS es_padre," +
    "    EXISTS (SELECT 1 FROM public.p_estructuras_egresos h WHERE h.padre_id = e.estructura_id AND h.user_id = e.user_id AND h.nombre_cuenta <> 'no_detail') AS tiene_hijos_reales" +
    "  FROM public.p_estructuras_egresos e WHERE e.user_id = 1" +
    ")" +
    "SELECT p.nombre_cuenta AS rubro, p.tiene_hijos_reales, count(*) AS gastos" +
    " FROM public.p_caja c JOIN padres p ON p.estructura_id = c.estructura_egreso_id" +
    " WHERE c.user_id = 1 AND c.estructura_egreso_id IS NOT NULL AND p.es_padre" +
    " GROUP BY p.nombre_cuenta, p.tiene_hijos_reales ORDER BY gastos DESC;"
  );
  const rows = Array.isArray(r) ? r : [];
  console.log('=== gastos apuntando a RUBRO PADRE, por rubro ===');
  rows.forEach((row) => console.log((row.tiene_hijos_reales ? 'CON hijos  ' : 'SIN hijos  ') + row.rubro + ': ' + row.gastos + ' gastos'));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });