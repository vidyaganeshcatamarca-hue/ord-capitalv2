const fs = require('fs');
function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

// 1. HomePage: el color de no_detail hereda del padre (la clave es el valor DB)
replaceOnce(
  'src/pages/Home/HomePage.tsx',
  "          if (c.nombre_cuenta === t('no_detail')) {",
  "          if (c.nombre_cuenta === 'no_detail') {",
  'home-color'
);

// 2. AddMovementModal: el hijo sin detalle por clave exacta (mas el legacy literal)
replaceOnce(
  'src/components/AddMovementModal/AddMovementModal.tsx',
  "      const sinDetalle = rubro.hijos.find(h => h.nombre_cuenta.toLowerCase().includes('sin detalle') || h.nombre_cuenta.toLowerCase().includes('[sin'))",
  "      const sinDetalle = rubro.hijos.find(h => h.nombre_cuenta === 'no_detail' || h.nombre_cuenta.toLowerCase().includes('sin detalle') || h.nombre_cuenta.toLowerCase().includes('[sin'))",
  'sin-detalle-match'
);

// 3. CategoriasPage: la busqueda matchea contra el nombre de display
replaceOnce(
  'src/pages/Categorias/CategoriasPage.tsx',
  "      .filter(r =>\n        !deferredQuery ||\n        r.nombre_cuenta.toLowerCase().includes(deferredQuery.toLowerCase()) ||\n        r.hijos?.some(h => h.nombre_cuenta.toLowerCase().includes(deferredQuery.toLowerCase()))\n      ),",
  "      .filter(r =>\n        !deferredQuery ||\n        catalogDisplayName(r.nombre_cuenta).toLowerCase().includes(deferredQuery.toLowerCase()) ||\n        r.hijos?.some(h => catalogDisplayName(h.nombre_cuenta).toLowerCase().includes(deferredQuery.toLowerCase()))\n      ),",
  'busqueda-display'
);
