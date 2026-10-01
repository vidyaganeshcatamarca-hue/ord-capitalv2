// Probe v2: arbol del usuario test con jsonb_agg
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false) AS cfg; SELECT jsonb_agg(to_jsonb(r)) AS arbol FROM fn_obtener_arbol_categorias() r; ROLLBACK;");
  const rows = Array.isArray(r) ? r : [];
  let arbol = Array.isArray(rows) && rows.length > 0 ? (rows[0].arbol ?? null) : null;
  if (Array.isArray(arbol) && Array.isArray(arbol[0])) arbol = arbol[0];
  if (!Array.isArray(arbol)) { console.log('arbol no encontrado:', JSON.stringify(r).slice(0, 400)); process.exit(1); }
  console.log('=== padres y hijos (top-level) ===');
  arbol.forEach((p) => {
    const hijos = p.hijos || [];
    console.log('- ' + p.nombre_cuenta + ' (id ' + p.estructura_id + ') hijos: ' + hijos.length);
    hijos.forEach((h) => console.log('    · ' + h.nombre_cuenta + ' (id ' + h.estructura_id + ')'));
  });
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
