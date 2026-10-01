// B3: botones iguales en CuarentenaPage + tap en el item abre edicion (ambas pantallas)
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// ── CuarentenaPage ──
let cp = fs.readFileSync('src/pages/Cuarentena/CuarentenaPage.tsx', 'utf8').split('\r\n').join('\n');
cp = replaceOnce(
  cp,
  '                <div key={p.pendiente_id} className="cuarentena-item">',
  '                <div key={p.pendiente_id} className="cuarentena-item" onClick={() => setItemEditar(p)}>',
  'cp-card-tap'
);
cp = replaceOnce(
  cp,
  '                    <button className="btn-cuarentena edit" onClick={() => setItemEditar(p)}>',
  '                    <button className="btn-cuarentena edit" onClick={(e) => { e.stopPropagation(); setItemEditar(p) }}>',
  'cp-btn-edit'
);
cp = replaceOnce(
  cp,
  '                    <button className="btn-cuarentena reject" onClick={() => setItemToReject(p)}>',
  '                    <button className="btn-cuarentena reject" onClick={(e) => { e.stopPropagation(); setItemToReject(p) }}>',
  'cp-btn-reject'
);
cp = replaceOnce(
  cp,
  '                      onClick={() => handleAprobarItem(p)}',
  '                      onClick={(e) => { e.stopPropagation(); handleAprobarItem(p) }}',
  'cp-btn-approve'
);
fs.writeFileSync('src/pages/Cuarentena/CuarentenaPage.tsx', cp);
console.log('CuarentenaPage OK');

// ── Cuarentena.css: flex-1 en los tres + cursor del item ──
let ccss = fs.readFileSync('src/pages/Cuarentena/Cuarentena.css', 'utf8').split('\r\n').join('\n');
ccss = replaceOnce(
  ccss,
  '.btn-cuarentena {\n  padding: 6px 12px;\n  border-radius: 8px;\n  font-size: calc(12px * var(--font-scale));\n  font-weight: 600;\n  border: none;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}',
  '.btn-cuarentena {\n  flex: 1;\n  justify-content: center;\n  padding: 6px 12px;\n  border-radius: 8px;\n  font-size: calc(12px * var(--font-scale));\n  font-weight: 600;\n  border: none;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n/* The whole card opens the edit modal; the action buttons opt out. */\n.cuarentena-item {\n  cursor: pointer;\n}',
  'css-iguales'
);
fs.writeFileSync('src/pages/Cuarentena/Cuarentena.css', ccss);
console.log('Cuarentena.css OK');

// ── BandejaCuarentena.tsx: tap en el card + stopPropagation de internos ──
let bx = fs.readFileSync('src/components/saneamiento/BandejaCuarentena.tsx', 'utf8').split('\r\n').join('\n');
bx = replaceOnce(
  bx,
  "              <div\n                key={item.pendiente_id}\n                className={`saneamiento-item ${seleccionados.has(item.pendiente_id) ? 'seleccionado' : ''}`}\n              >",
  "              <div\n                key={item.pendiente_id}\n                className={`saneamiento-item ${seleccionados.has(item.pendiente_id) ? 'seleccionado' : ''}`}\n                onClick={() => setItemEditar(item)}\n              >",
  'bx-card-tap'
);
bx = replaceOnce(
  bx,
  "                      <button className=\"saneamiento-item-link\" onClick={() => verFoto(item.metadata)}>",
  "                      <button className=\"saneamiento-item-link\" onClick={(e) => { e.stopPropagation(); verFoto(item.metadata) }}>",
  'bx-foto'
);
bx = replaceOnce(
  bx,
  "                      <button className=\"saneamiento-item-link\" onClick={() => escucharAudio(item.metadata)}>",
  "                      <button className=\"saneamiento-item-link\" onClick={(e) => { e.stopPropagation(); escucharAudio(item.metadata) }}>",
  'bx-audio'
);
bx = replaceOnce(
  bx,
  "    <div className=\"cuarentena-ambig\">",
  "    <div className=\"cuarentena-ambig\" onClick={(e) => e.stopPropagation()}>",
  'bx-ambig'
);
fs.writeFileSync('src/components/saneamiento/BandejaCuarentena.tsx', bx);
console.log('BandejaCuarentena OK');

// ── BandejaCuarentena.css: cursor del item ──
let bcss = fs.readFileSync('src/components/saneamiento/BandejaCuarentena.css', 'utf8').split('\r\n').join('\n');
bcss = replaceOnce(
  bcss,
  '.saneamiento-item-actions button:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}',
  '.saneamiento-item-actions button:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n/* The whole card opens the edit modal; the checkbox, links and the\n   ambiguity selector opt out with their own stopPropagation. */\n.saneamiento-item {\n  cursor: pointer;\n}',
  'bcss-cursor'
);
fs.writeFileSync('src/components/saneamiento/BandejaCuarentena.css', bcss);
console.log('BandejaCuarentena.css OK');