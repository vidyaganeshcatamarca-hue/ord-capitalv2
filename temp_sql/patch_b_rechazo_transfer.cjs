// Dos fixes del dueno: rechazo directo sin preguntas + transfer origin como titulo
const fs = require('fs');
const FILE = 'src/components/saneamiento/BandejaCuarentena.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// ── 1. rechazo directo (sin modal de motivo/nota que nadie usa) ──
src = replaceOnce(
  src,
  '                  <button className="saneamiento-btn-rechazar" onClick={(e) => { e.stopPropagation(); setItemRechazar(item) }}>',
  '                  <button className="saneamiento-btn-rechazar" onClick={(e) => { e.stopPropagation(); handleRechazarItem() }}>',
  'btn-directo'
);

// el handle toma el item rechazar de forma implicita: refactor a recibir el item
src = replaceOnce(
  src,
  "  const handleRechazarItem = async (_motivo: string, _nota: string) => {\n    if (!itemRechazar) return\n    try {\n      await rpc('fn_rechazar_cuarentena', { p_pendiente_id: itemRechazar.pendiente_id })\n      showToast(t('saneamiento_toast_rechazado'), 'success')\n      setItemRechazar(null)\n      onChange()\n      fetchItems()\n    } catch (err: any) {\n      showToast(parseError(err), 'error')\n    }\n  }",
  "  const handleRechazarItem = async (item?: CuarentenaItem) => {\n    const target = item ?? itemRechazar\n    if (!target) return\n    try {\n      await rpc('fn_rechazar_cuarentena', { p_pendiente_id: target.pendiente_id })\n      showToast(t('saneamiento_toast_rechazado'), 'success')\n      setItemRechazar(null)\n      onChange()\n      fetchItems()\n    } catch (err: any) {\n      showToast(parseError(err), 'error')\n    }\n  }",
  'handle-item'
);

// bloque del modal de rechazo: fuera
src = replaceOnce(
  src,
  "      {itemRechazar && (\n        <RechazarCuarentenaModal\n          item={itemRechazar}\n          isOpen={true}\n          onClose={() => setItemRechazar(null)}\n          onConfirmar={handleRechazarItem}\n        />\n      )}\n\n",
  "",
  'modal-fuera'
);

// import del modal: fuera
src = replaceOnce(
  src,
  "import { RechazarCuarentenaModal } from './RechazarCuarentenaModal'\n",
  "",
  'import-fuera'
);

// ── 2. transfer: titulo = cuenta ORIGEN; destino queda en los chips ──
src = replaceOnce(
  src,
  "                      <span>{\n                        // Income and transfer rows receive money at the\n                        // destination wallet: that account is the meaningful\n                        // title; a category does not exist for them.\n                        (tipo === 'income' || tipo === 'transfer') && item.billetera_destino_nombre\n                          ? t(item.billetera_destino_nombre)\n                          : item.categoria_nombre\n                            ? t(item.categoria_nombre)\n                            : t('saneamiento_sin_categoria')\n                      }</span>",
  "                      <span>{\n                        // Transfers show the ORIGIN account as the main title\n                        // (where the money leaves from); the destination stays\n                        // visible in the wallet chips below.\n                        tipo === 'transfer' && item.billetera_nombre\n                          ? t(item.billetera_nombre)\n                          : tipo === 'income' && item.billetera_destino_nombre\n                            ? t(item.billetera_destino_nombre)\n                            : item.categoria_nombre\n                              ? t(item.categoria_nombre)\n                              : t('saneamiento_sin_categoria')\n                      }</span>",
  'transfer-origen'
);

fs.writeFileSync(FILE, src);
console.log('A ok');