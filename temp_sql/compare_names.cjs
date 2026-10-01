// Compare live function name vs frontend call sites (read-only)
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync('temp_sql/voice_v1_reporte_live.json', 'utf8'));
const live = rows[0].proname;
const def = rows[0].def || '';
console.log('nombre vivo:', JSON.stringify(live), '(length ' + live.length + ')');
const filterState = def.includes("'pending'")
  ? "'pending' INGLES (ROTO)"
  : def.includes("'pendiente'")
    ? "'pendiente' OK"
    : 'sin filtro estado';
console.log('filtro estado en def:', filterState);

const files = [
  'src/components/saneamiento/BandejaCuarentena.tsx',
  'src/pages/Cuarentena/CuarentenaPage.tsx',
  'src/pages/Saneamiento/SaneamientoPage.tsx',
  'src/components/voice/VoiceHomeFab.tsx',
];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const calls = src.match(/fn_reporte_cuarentena[a-z_]*/g) || [];
  console.log(f.split('/').pop() + ' llama:', JSON.stringify([...new Set(calls)]));
}
