// parseError: el param {nombre} puede ser una clave de catalogo de DB
// (wallet_cash_default_name en los errores de saldo) -> resolve con t()
// (translate-or-passthrough, el mismo criterio del resto de los renders).
const fs = require('fs');
const FILE = 'src/locales/i18n.ts';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

const INJECT = [
  '          trackAppError(parsed.key);',
  '          // The {nombre} param can hold a DB catalog key (the wallet name in',
  '          // insufficient-balance errors): resolve it like every catalog name.',
  '          if (parsed.params && typeof parsed.params.nombre === \'string\') {',
  '            parsed.params.nombre = t(parsed.params.nombre)',
  '          }',
  '          return t(parsed.key, parsed.params);',
].join('\n');

src = replaceOnce(
  src,
  '          trackAppError(parsed.key);\n          return t(parsed.key, parsed.params);',
  INJECT,
  'sitio-anidado'
);

src = replaceOnce(
  src,
  '      trackAppError(parsed.key);\n      return t(parsed.key, parsed.params);',
  '      trackAppError(parsed.key);\n      // Same resolution for the outer parsed message.\n      if (parsed.params && typeof parsed.params.nombre === \'string\') {\n        parsed.params.nombre = t(parsed.params.nombre)\n      }\n      return t(parsed.key, parsed.params);',
  'sitio-externo'
);

fs.writeFileSync(FILE, src);
console.log('parseError OK');