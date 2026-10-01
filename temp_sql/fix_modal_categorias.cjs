// Filtro de categorias sistema + fallback de icono Lucide (patron AddMovementModal)
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count + ' coincidencias'); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. imports
src = replaceOnce(
  src,
  "import { formatCurrency } from '@/lib/format'\nimport type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'",
  "import { formatCurrency } from '@/lib/format'\nimport { filterUserEditableCategories, isUserEditableCategory } from '@/lib/categoryFilters'\nimport { isLikelyLucideName } from '@/components/CategoryIcon/CategoryIcon'\nimport type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'",
  'imports'
);

// 2. load: filtrar arbol + resolver icono (Lucide name -> icono del padre o generico)
src = replaceOnce(
  src,
  "        const flat: CategoriaOption[] = []\n        const walk = (nodes: any[]) => {\n          nodes.forEach((n) => {\n            if (!n.es_padre) {\n              flat.push({\n                estructura_id: n.estructura_id,\n                nombre_cuenta: n.nombre_cuenta,\n                icono: n.icono,\n                es_padre: false,\n              })\n            }\n            if (n.hijos && n.hijos.length) walk(n.hijos)\n          })",
  "        // Same category rules as AddMovementModal: system categories are never\n        // user-editable, and icon names from the icon library are not valid\n        // text for a native <option>, so they fall back to the parent's icon.\n        const editable = filterUserEditableCategories(catRes ?? []).map((r) => ({\n          ...r,\n          hijos: (r.hijos ?? []).filter((h) => isUserEditableCategory(h)),\n        }))\n        const flat: CategoriaOption[] = []\n        const walk = (nodes: any[], parentIcono: string | null) => {\n          nodes.forEach((n) => {\n            const rawIcono = typeof n.icono === 'string' ? n.icono.trim() : ''\n            const icono = rawIcono !== '' && !isLikelyLucideName(rawIcono)\n              ? rawIcono\n              : (parentIcono ?? '\ud83d\udcc1')\n            if (!n.es_padre) {\n              flat.push({\n                estructura_id: n.estructura_id,\n                nombre_cuenta: n.nombre_cuenta,\n                icono,\n                es_padre: false,\n              })\n            }\n            if (n.hijos && n.hijos.length) walk(n.hijos, icono)\n          })",
  'walk'
);

// 3. la llamada inicial del walk con el arbol filtrado
src = replaceOnce(
  src,
  "walk(catRes || [])",
  "walk(editable, null)",
  'walk-call'
);

fs.writeFileSync(FILE, src);
console.log('surgery OK');
