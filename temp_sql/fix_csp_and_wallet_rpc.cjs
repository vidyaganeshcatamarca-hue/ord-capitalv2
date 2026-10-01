// Fix 1: CSP + Fix 2: RPC correcta de billeteras en contextBuilder
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': se esperaba 1 match, hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

// --- index.html: agregar api.ordcapital.app a connect-src ---
const f1 = 'index.html';
let html = fs.readFileSync(f1, 'utf8');
html = replaceOnce(
  html,
  "connect-src 'self' https://bjszdmheddcxjdhcvibi.supabase.co",
  "connect-src 'self' https://api.ordcapital.app https://bjszdmheddcxjdhcvibi.supabase.co",
  'CSP connect-src'
);
fs.writeFileSync(f1, html);
console.log('CSP: api.ordcapital.app agregado a connect-src');

// --- contextBuilder: RPC correcta ---
const f2 = 'src/voice/contextBuilder.ts';
let src = fs.readFileSync(f2, 'utf8');
src = replaceOnce(
  src,
  ' * `fn_obtener_billeteras_ordenadas_por_uso` first, `fn_obtener_billeteras_activas` on failure.',
  " * `fn_obtener_billeteras_ordenadas` (p_orden: 'valor', el default del app) first,\n * `fn_obtener_billeteras_activas` on failure.",
  'comentario'
);
src = replaceOnce(
  src,
  "    const data = await rpc<VoiceCatalogWalletRow[]>('fn_obtener_billeteras_ordenadas_por_uso');",
  "    const data = await rpc<VoiceCatalogWalletRow[]>('fn_obtener_billeteras_ordenadas', { p_orden: 'valor' });",
  'rpc llamada'
);
fs.writeFileSync(f2, src);
console.log('contextBuilder: RPC corregida');
