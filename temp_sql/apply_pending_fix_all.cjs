// Fix estado 'pending' -> 'pendiente' en las 5 legacy (autorizado)
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

const names = [
  'fn_aprobar_cuarentena',
  'fn_aprobar_gastos_cuarentena_lote',
  'fn_editar_cuarentena',
  'fn_editar_gasto_cuarentena',
  'fn_reporte_alertas_home',
];

(async () => {
  const fixes = [];
  for (const name of names) {
    const r = await q("SELECT p.oid, pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = '" + name + "' AND p.pronamespace = 'public'::regnamespace;");
    const rows = Array.isArray(r) ? r : [];
    if (rows.length === 0) {
      console.log('SKIP ' + name + ': no existe en viva');
      continue;
    }
    for (const row of rows) {
      const def = row.def || '';
      const before = (def.match(/'pending'/g) || []).length;
      if (before === 0) {
        console.log('SKIP ' + name + ' (oid ' + row.oid + '): sin pending');
        continue;
      }
      const fixed = def.split("'pending'").join("'pendiente'");
      const after = (fixed.match(/'pending'/g) || []).length;
      fixes.push({ name, oid: row.oid, def: fixed });
      console.log('FIX ' + name + ' (oid ' + row.oid + '): pending ' + before + ' -> 0 (queda ' + after + ')');
    }
  }
  fs.writeFileSync('temp_sql/voice_pending_fix_defs.json', JSON.stringify(fixes, null, 2));
  console.log('=== ' + fixes.length + ' definiciones listas en temp_sql/voice_pending_fix_defs.json ===');
  for (const f of fixes) {
    const r = await q(f.def);
    console.log('APLICADO ' + f.name + ' (oid ' + f.oid + '):', JSON.stringify(r));
  }
  // Verificacion post: LIKE 'pending' en las 5
  const nameList = names.map((n) => "'" + n + "'").join(',');
  const v = await q("SELECT p.proname, (pg_get_functiondef(p.oid) LIKE '%''pending''%') AS tiene_pending FROM pg_proc p WHERE p.proname IN (" + nameList + ") AND p.pronamespace = 'public'::regnamespace ORDER BY p.proname;");
  console.log('=== verificacion post-fix ===');
  console.log(JSON.stringify(v, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
