// Exact name comparison: live RPC vs frontend call (read-only)
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync('temp_sql/voice_v1_reporte_live.json', 'utf8'));
const live = rows[0].proname;
console.log('LIVE  :', JSON.stringify(live), '(length ' + live.length + ')');

const src = fs.readFileSync('src/components/saneamiento/BandejaCuarentena.tsx', 'utf8');
const calls = [...new Set(src.match(/fn_reporte_cuarentena[a-z_]*/g) || [])];
for (const c of calls) {
  console.log('FRONT :', JSON.stringify(c), '(length ' + c.length + ') — ' + (c === live ? 'MATCH' : 'DIFFERENT'));
}

// Tambien el resto de los call-sites
for (const f of ['src/pages/Cuarentena/CuarentenaPage.tsx', 'src/pages/Saneamiento/SaneamientoPage.tsx', 'src/components/voice/VoiceHomeFab.tsx', 'src/voice/useVoiceQuarantine.ts']) {
  const s = fs.readFileSync(f, 'utf8');
  const cc = [...new Set(s.match(/fn_(reporte_cuarentena|cargar_movimientos_voz|aprobar_cuarentena[a-z_]*|editar_cuarentena[a-z_]*|rechazar_cuarentena)[a-z_]*/g) || [])];
  console.log(f.split('/').pop() + ':', JSON.stringify(cc));
}
