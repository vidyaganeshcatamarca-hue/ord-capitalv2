// BandejaCuarentena: muere 'api_banco' como origen (el dato ahora es voz)
const fs = require('fs');
const FILE = 'src/components/saneamiento/BandejaCuarentena.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. comentario del helper isVoiceItem
src = replaceOnce(
  src,
  "/**\n * Voice rows are the only quarantine rows carrying a non-null `metadata.job_id`.\n * `origen` is not a valid discriminator: voice inserts use `origen = 'api_banco'`\n * like imported bank statements.\n */",
  "/**\n * `origen = 'voz'` marks voice rows in the DB (the quarantine constraint\n * allows recurrente/ocr/voz). `metadata.job_id` stays as the first-class\n * discriminator so legacy rows inserted as 'api_banco' keep working.\n */",
  'comentario'
);

// 2. tipo FiltroOrigen sin api_banco
src = replaceOnce(
  src,
  "type FiltroOrigen = 'todos' | 'api_banco' | 'ocr' | 'recurrente' | 'voz'",
  "type FiltroOrigen = 'todos' | 'ocr' | 'recurrente' | 'voz'",
  'tipo'
);

// 3. conteos sin api_banco
src = replaceOnce(
  src,
  "      todos: items.length,\n      api_banco: items.filter((i) => i.origen === 'api_banco').length,\n      ocr: items.filter((i) => i.origen === 'ocr').length,",
  "      todos: items.length,\n      ocr: items.filter((i) => i.origen === 'ocr').length,",
  'conteos'
);

// 4. chips sin el chip de banco
src = replaceOnce(
  src,
  "    { key: 'todos', label: t('saneamiento_filtro_todos') },\n    { key: 'api_banco', label: `${t('saneamiento_origen_banco')} (${conteos.api_banco})` },\n    { key: 'ocr', label: `📷 OCR (${conteos.ocr})` },",
  "    { key: 'todos', label: t('saneamiento_filtro_todos') },\n    { key: 'ocr', label: `📷 OCR (${conteos.ocr})` },",
  'chips'
);

// 5. OrigenBadge sin la rama api_banco
src = replaceOnce(
  src,
  "  if (origen === 'recurrente') return <span className=\"saneamiento-badge saneamiento-badge-recurrente\">{t('saneamiento_recurrente')}</span>\n  if (origen === 'api_banco') return <span className=\"saneamiento-badge\">{t('saneamiento_origen_banco')}</span>",
  "  if (origen === 'recurrente') return <span className=\"saneamiento-badge saneamiento-badge-recurrente\">{t('saneamiento_recurrente')}</span>",
  'badge'
);

fs.writeFileSync(FILE, src);
console.log('frontend OK');

// 6. es.ts: la clave muerta saneamiento_origen_banco
const ES = 'src/locales/es.ts';
let es = fs.readFileSync(ES, 'utf8').split('\r\n').join('\n');
const needle = '  saneamiento_origen_banco: "Banco",\n';
const count = es.split(needle).length - 1;
if (count !== 1) { console.error('ABORT es.ts: hay ' + count); process.exit(1); }
es = es.split(needle).join('');
fs.writeFileSync(ES, es);
console.log('key muerta OK');
