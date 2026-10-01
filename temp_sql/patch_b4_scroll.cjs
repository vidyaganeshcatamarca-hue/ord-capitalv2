// B4-sigue: /cuarentena con wrapper de pagina (scroll) + mensaje de incompletos como accion
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. App.tsx: el route envuelve la Bandeja en el contenedor de pagina
let app = fs.readFileSync('src/App.tsx', 'utf8').split('\r\n').join('\n');
const oldWrapper = [
  '/** /cuarentena lands on the unified Bandeja de Entrada. Back = history;',
  ' * tray changes announce the global event so Home refreshes its widgets. */',
  'function CuarentenaBandejaRoute() {',
  '  const navigate = useNavigate()',
  '  return (',
  '    <CuarentenaBandeja',
  "      onVolver={() => navigate(-1)}",
  "      onChange={() => window.dispatchEvent(new CustomEvent('movement-added'))}",
  '    />',
  '  )',
  '}',
].join('\n');
const newWrapper = [
  '/** /cuarentena lands on the unified Bandeja de Entrada. The page wrapper',
  ' * class is what gives the route its scroll space under the bottom nav',
  ' * (same container as /saneamiento). Back = history; tray changes announce',
  ' * the global event so Home refreshes its widgets. */',
  'function CuarentenaBandejaRoute() {',
  '  const navigate = useNavigate()',
  '  return (',
  '    <div className="page saneamiento-page">',
  '      <CuarentenaBandeja',
  "        onVolver={() => navigate(-1)}",
  "        onChange={() => window.dispatchEvent(new CustomEvent('movement-added'))}",
  '      />',
  '    </div>',
  '  )',
  '}',
].join('\n');
app = replaceOnce(app, oldWrapper, newWrapper, 'wrapper-page');
fs.writeFileSync('src/App.tsx', app);
console.log('App.tsx OK');

// 2. es.ts: el aviso dice que se editan, no que se excluyen
let es = fs.readFileSync('src/locales/es.ts', 'utf8').split('\r\n').join('\n');
es = replaceOnce(
  es,
  '  cuarentena_lote_excluidos: "{count} quedaron fuera por estar incompletos.",',
  '  cuarentena_lote_excluidos: "{count} con datos incompletos: editalos para poder aprobarlos.",',
  'es-aviso'
);
fs.writeFileSync('src/locales/es.ts', es);
console.log('es.ts OK');