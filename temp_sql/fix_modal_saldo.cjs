// Regla de saldo en EditarCuarentenaModal (patron AddMovementModal) + t() en nombres de categoria
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. t() en el nombre de categoria al aplanar el arbol
src = replaceOnce(
  src,
  '              flat.push({\n                estructura_id: n.estructura_id,\n                nombre_cuenta: n.nombre_cuenta,\n                icono,\n                es_padre: false,\n              })',
  '              flat.push({\n                estructura_id: n.estructura_id,\n                // Seed categories store an i18n key as the name (same as\n                // AddMovementModal): translate on display, pass user names\n                // through unchanged.\n                nombre_cuenta: t(n.nombre_cuenta),\n                icono,\n                es_padre: false,\n              })',
  't-nombre'
);

// 2. filtro de saldo + reset defensivo, junto a los memos existentes
src = replaceOnce(
  src,
  "  const crossCurrency = !!billeteraMoneda && !!billeteraDestinoMoneda && billeteraMoneda !== billeteraDestinoMoneda",
  "  const crossCurrency = !!billeteraMoneda && !!billeteraDestinoMoneda && billeteraMoneda !== billeteraDestinoMoneda\n\n  // Same balance rule as AddMovementModal: a wallet cannot end up negative,\n  // so expense and transfer origin wallets must cover the amount.\n  const montoFormNum = parseFloat(monto) || 0\n  const requiereSaldoSuficiente = tipo === 'expense' || tipo === 'transfer'\n  const billeterasOrigen = useMemo(\n    () =>\n      billeteras.filter(\n        (b) => !(requiereSaldoSuficiente && montoFormNum > 0 && b.saldo_actual < montoFormNum)\n      ),\n    [billeteras, requiereSaldoSuficiente, montoFormNum]\n  )\n\n  // Defensive reset: if the prefilled wallet is no longer valid (deleted or\n  // insufficient balance for the edited amount), clear it so the submit\n  // validation asks for a valid one instead of sending a stale id.\n  useEffect(() => {\n    if (!requiereSaldoSuficiente || !billeteraId) return\n    const sel = billeterasOrigen.find((b) => String(b.billetera_id) === billeteraId)\n    if (!sel) setBilleteraId('')\n  }, [requiereSaldoSuficiente, billeteraId, billeterasOrigen])",
  'filtro-saldo'
);

// 3. el select de origen usa la lista filtrada (el de destino queda igual)
src = replaceOnce(
  src,
  "                <select value={billeteraId} onChange={(e) => setBilleteraId(e.target.value)}>\n                  <option value=\"\">{t('saneamiento_seleccionar_billetera')}</option>\n                  {billeteras.map((b) => (",
  "                <select value={billeteraId} onChange={(e) => setBilleteraId(e.target.value)}>\n                  <option value=\"\">{t('saneamiento_seleccionar_billetera')}</option>\n                  {billeterasOrigen.map((b) => (",
  'select-origen'
);

fs.writeFileSync(FILE, src);
console.log('surgery saldo OK');
