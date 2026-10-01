// Probe: arbol de categorias del usuario test (GUC mockeado)
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const r = await q("SELECT set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false) AS cfg; SELECT to_jsonb(fn_obtener_arbol_categorias()) AS arbol; ROLLBACK;");
  const rows = Array.isArray(r) ? r : [];
  const arbol = rows[1] && rows[1].arbol;
  // Buscar Tecnologia/Electro y sus hijos
  const s = JSON.stringify(arbol, null, 1);
  const tec = [];
  let inTec = false;
  for (const line of s.split('\n')) {
    if (/Tecnolog/i.test(line)) inTec = true;
    if (inTec) tec.push(line.trim());
    if (inTec && /^[\]}]/.test(line.trim()) && tec.length > 3) break;
  }
  console.log('=== fragmento del arbol: Tecnologia/Electro ===');
  console.log(tec.slice(0, 25).join('\n'));
  console.log('...total nodos del arbol:', (JSON.stringify(arbol).match(/estructura_id/g) || []).length);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
