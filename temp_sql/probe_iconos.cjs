// Probe: icono de TODOS los nodos del arbol, marcando valores no-emoji
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false) AS cfg; SELECT jsonb_agg(to_jsonb(r)) AS arbol FROM fn_obtener_arbol_categorias() r; ROLLBACK;");
  const rows = Array.isArray(r) ? r : [];
  let arbol = rows.length > 0 ? (rows[0].arbol ?? null) : null;
  if (Array.isArray(arbol) && Array.isArray(arbol[0])) arbol = arbol[0];
  if (!Array.isArray(arbol)) { console.log('no arbol', JSON.stringify(r).slice(0, 300)); process.exit(1); }
  const esEmoji = (s) => typeof s === 'string' && s.length <= 4 && [...s].some((c) => c.codePointAt(0) >= 0x1F000);
  console.log('=== nodos con icono NO-emoji (bug candidatos) ===');
  let bad = 0;
  arbol.forEach((p) => {
    if (!esEmoji(p.icono)) { bad++; console.log('PADRE  id ' + p.estructura_id + ' icono=' + JSON.stringify(p.icono) + ' nombre=' + p.nombre_cuenta); }
    (p.hijos || []).forEach((h) => {
      if (!esEmoji(h.icono)) { bad++; console.log('  HIJO id ' + h.estructura_id + ' icono=' + JSON.stringify(h.icono) + ' nombre=' + h.nombre_cuenta + ' (padre=' + p.nombre_cuenta + ')'); }
    });
  });
  console.log('total nodos no-emoji: ' + bad);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
