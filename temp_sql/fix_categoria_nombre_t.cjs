const fs = require('fs');

function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

// 1. CuarentenaPage: el titulo de la card (cat_housing -> Vivienda)
replaceOnce(
  'src/pages/Cuarentena/CuarentenaPage.tsx',
  "<CategoryIcon name={TYPE_ICON[tipo]} size={18} /> {p.categoria_nombre || t('quarantine_no_detail')}",
  "<CategoryIcon name={TYPE_ICON[tipo]} size={18} /> {p.categoria_nombre ? t(p.categoria_nombre) : t('quarantine_no_detail')}",
  'titulo-card'
);

// 2. CuarentenaPage: el desc de la confirmacion de rechazo
replaceOnce(
  'src/pages/Cuarentena/CuarentenaPage.tsx',
  "desc: itemToReject.detalle || itemToReject.categoria_nombre || '',",
  "desc: itemToReject.detalle || (itemToReject.categoria_nombre ? t(itemToReject.categoria_nombre) : ''),",
  'desc-rechazo'
);

// 3. BandejaCuarentena: los candidatos de ambiguedad (nombres seed de wallet/categoria)
replaceOnce(
  'src/components/saneamiento/BandejaCuarentena.tsx',
  '<span className="cuarentena-ambig-nombre">{candidate.name}</span>',
  '<span className="cuarentena-ambig-nombre">{t(candidate.name)}</span>',
  'candidatos'
);
