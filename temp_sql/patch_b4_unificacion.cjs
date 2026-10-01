// B4: /cuarentena = Bandeja de Entrada unificada (fuera CuarentenaPage)
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

let app = fs.readFileSync('src/App.tsx', 'utf8').split('\r\n').join('\n');

// 1. lazy: la pagina de cuarentena sale; entra la Bandeja
app = replaceOnce(
  app,
  "const CuarentenaPage = lazy(() => import('@/pages/Cuarentena/CuarentenaPage').then(module => ({ default: module.CuarentenaPage })))",
  "const CuarentenaBandeja = lazy(() => import('@/components/saneamiento/BandejaCuarentena').then(module => ({ default: module.BandejaCuarentena })))",
  'lazy'
);

// 2. route
app = replaceOnce(
  app,
  '          <Route path="/cuarentena" element={<CuarentenaPage />} />',
  '          <Route path="/cuarentena" element={<CuarentenaBandejaRoute />} />',
  'route'
);

// 3. wrapper con useNavigate, anclado despues de la lazy de SaneamientoPage
const anchor = "const SaneamientoPage = lazy(() => import('@/pages/Saneamiento/SaneamientoPage').then(module => ({ default: module.SaneamientoPage })))";
const wrapperBlock = anchor + '\n' + [
  '',
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
app = replaceOnce(app, anchor, wrapperBlock, 'wrapper');

// 4. useNavigate import
app = replaceOnce(
  app,
  "import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'",
  "import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'",
  'useNavigate'
);

fs.writeFileSync('src/App.tsx', app);

// 5. la Bandeja importa el CSS base compartido (antes del propio)
let bx = fs.readFileSync('src/components/saneamiento/BandejaCuarentena.tsx', 'utf8').split('\r\n').join('\n');
bx = replaceOnce(
  bx,
  "import './BandejaCuarentena.css'",
  "// Shared saneamiento item styles (item layout, checkbox, flex actions) live in\n// SaneamientoPage.css; import it first so the local sheet can override.\nimport '@/pages/Saneamiento/SaneamientoPage.css'\nimport './BandejaCuarentena.css'",
  'css-base'
);
fs.writeFileSync('src/components/saneamiento/BandejaCuarentena.tsx', bx);

console.log('B4 patches OK');