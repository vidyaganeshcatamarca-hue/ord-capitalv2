// B3-sigue: stopPropagation en los 3 botones de accion de la Bandeja (el card abre edicion)
const fs = require('fs');
const FILE = 'src/components/saneamiento/BandejaCuarentena.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

src = replaceOnce(
  src,
  '                  <button className="saneamiento-btn-editar" onClick={() => setItemEditar(item)}>',
  '                  <button className="saneamiento-btn-editar" onClick={(e) => { e.stopPropagation(); setItemEditar(item) }}>',
  'btn-editar'
);

src = replaceOnce(
  src,
  '                  <button className="saneamiento-btn-rechazar" onClick={() => setItemRechazar(item)}>',
  '                  <button className="saneamiento-btn-rechazar" onClick={(e) => { e.stopPropagation(); setItemRechazar(item) }}>',
  'btn-rechazar'
);

src = replaceOnce(
  src,
  "                    onClick={() => handleAprobarItem(item)}",
  "                    onClick={(e) => { e.stopPropagation(); handleAprobarItem(item) }}",
  'btn-aprobar'
);

fs.writeFileSync(FILE, src);
console.log('stopPropagation OK');