// B5: la card de ingreso/transferencia en la Bandeja muestra la cuenta destino
// y el monto del ingreso en verde (+).
const fs = require('fs');
const FILE = 'src/components/saneamiento/BandejaCuarentena.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. titulo: income/transfer = la cuenta destino (si existe)
src = replaceOnce(
  src,
  "                      <span>{item.categoria_nombre ? t(item.categoria_nombre) : t('saneamiento_sin_categoria')}</span>",
  "                      <span>{\n                        // Income and transfer rows receive money at the\n                        // destination wallet: that account is the meaningful\n                        // title; a category does not exist for them.\n                        (tipo === 'income' || tipo === 'transfer') && item.billetera_destino_nombre\n                          ? t(item.billetera_destino_nombre)\n                          : item.categoria_nombre\n                            ? t(item.categoria_nombre)\n                            : t('saneamiento_sin_categoria')\n                      }</span>",
  'titulo'
);

// 2. monto: ingreso = verde con signo + ; transfer = color neutro (no es un egreso)
src = replaceOnce(
  src,
  "                  <div className=\"saneamiento-item-monto\">\n                    <span className=\"font-mono font-bold\">{formatCurrency(item.monto, itemCurrency(item))}</span>\n                  </div>",
  "                  <div className=\"saneamiento-item-monto\">\n                    <span\n                      className=\"font-mono font-bold\"\n                      style={{\n                        color: tipo === 'income'\n                          ? 'var(--mint, var(--mint, #00B127))'\n                          : tipo === 'transfer'\n                            ? 'var(--text, #FFFFFF)'\n                            : undefined,\n                      }}\n                    >\n                      {tipo === 'income' ? '+' : ''}\n                      {formatCurrency(item.monto, itemCurrency(item))}\n                    </span>\n                  </div>",
  'monto'
);

fs.writeFileSync(FILE, src);
console.log('B5 OK');