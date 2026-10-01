// Verify the 3 fixes (read-only)
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
        res.on('data', (d) => { out = out + d; });
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
  const sqlVerify =
    "SELECT p.proname, " +
    "(pg_get_functiondef(p.oid) LIKE '%''pending''%') AS tiene_pending, " +
    "(pg_get_functiondef(p.oid) LIKE '%''pendiente''%') AS tiene_pendiente, " +
    "(pg_get_functiondef(p.oid) LIKE '%ambiguous_matches%') AS tiene_ambig " +
    "FROM pg_proc p WHERE p.proname IN ('fn_reporte_cuarentena_pendients','fn_rechazar_cuarentena','fn_cargar_movimientos_voz') " +
    "AND p.pronamespace = 'public'::regnamespace;";
  // NOTA: los nombres van sin la 's' final en pendients — corregir si el vivo es pendients
  // Re-consultar con el nombre EXACTO que resolvio el inventario:
  const sqlFix =
    "SELECT p.proname, " +
    "(pg_get_functiondef(p.oid) LIKE '%''pending''%') AS tiene_pending, " +
    "(pg_get_functiondef(p.oid) LIKE '%''pendiente''%') AS tiene_pendiente, " +
    "(pg_get_functiondef(p.oid) LIKE '%ambiguous_matches%') AS tiene_ambig " +
    "FROM pg_proc p WHERE p.proname IN ('fn_reporte_cuarentena_pendientes','fn_rechazar_cuarentena','fn_cargar_movimientos_voz') " +
    "AND p.pronamespace = 'public'::regnamespace;";

  const r = await q(sqlFix);
  let rows = Array.isArray(r) ? r : [];
  if (rows.length === 0) {
    console.log('(con pendientes-s no matcheo; reintento con pendientes-es)');
    const r2 = await q(sqlFix);
    rows = Array.isArray(r2) ? r2 : [];
  }
  console.log(JSON.stringify(rows, null, 2));

  const c = await q("SELECT count(*) AS pendientes_en_cuarentena FROM p_caja_cuarentena WHERE estado = 'pendiente';");
  console.log('=== filas que vera fn_reporte con el vocabulario correcto ===');
  console.log(JSON.stringify(c));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
