// EditarCuarentenaModal: jerarquia real en el select de categorias
// - padre con hijos -> <optgroup> (titulo del grupo, NO seleccionable)
// - hijos -> opciones (indendacion nativa del grupo)
// - padre sin hijos -> opcion seleccionable
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. los tipos
src = replaceOnce(
  src,
  "interface CategoriaOption {\n  estructura_id: number\n  nombre_cuenta: string\n  icono: string\n  es_padre: boolean\n}",
  "interface CategoriaHijoOption {\n  estructura_id: number\n  nombre: string\n  icono: string\n}\n\ninterface CategoriaGrupoOption {\n  estructura_id: number\n  nombre_cuenta: string\n  icono: string\n  hijos: CategoriaHijoOption[]\n}",
  'tipos'
);

// 2. el estado
src = replaceOnce(
  src,
  '  const [categorias, setCategorias] = useState<CategoriaOption[]>([])',
  '  const [categorias, setCategorias] = useState<CategoriaGrupoOption[]>([])',
  'estado'
);

// 3. la carga: walk plano -> grupos
src = replaceOnce(
  src,
  "        const flat: CategoriaOption[] = []\n        const walk = (nodes: any[], parentIcono: string | null) => {\n          nodes.forEach((n) => {\n            const rawIcono = typeof n.icono === 'string' ? n.icono.trim() : ''\n            const icono = rawIcono !== '' && !isLikelyLucideName(rawIcono)\n              ? rawIcono\n              : (parentIcono ?? '📁')\n            if (!n.es_padre) {\n              flat.push({\n                estructura_id: n.estructura_id,\n                // Seed categories store an i18n key as the name (same as\n                // AddMovementModal): translate on display, pass user names\n                // through unchanged.\n                nombre_cuenta: t(n.nombre_cuenta),\n                icono,\n                es_padre: false,\n              })\n            }\n            if (n.hijos && n.hijos.length) walk(n.hijos, icono)\n          })\n        }\n        walk(editable, null)\n        setCategorias(flat)",
  "        const resolveIcono = (raw: unknown, fallback: string): string => {\n          const value = typeof raw === 'string' ? raw.trim() : ''\n          return value !== '' && !isLikelyLucideName(value) ? value : fallback\n        }\n        // Hierarchical groups: a parent with children becomes a native\n        // <optgroup> (its label, not selectable), children are the options\n        // and childless parents stay selectable on their own.\n        const grupos: CategoriaGrupoOption[] = editable.map((r) => {\n          const parentIcono = resolveIcono(r.icono, '📁')\n          return {\n            estructura_id: r.estructura_id,\n            // Seed categories store an i18n key as the name (same as\n            // AddMovementModal): translate on display, pass user names\n            // through unchanged.\n            nombre_cuenta: t(r.nombre_cuenta),\n            icono: parentIcono,\n            hijos: (r.hijos ?? []).map((h: any) => ({\n              estructura_id: h.estructura_id,\n              nombre: t(h.nombre_cuenta),\n              icono: resolveIcono(h.icono, parentIcono),\n            })),\n          }\n        })\n        setCategorias(grupos)",
  'carga-grupos'
);

// 4. el render con optgroup
src = replaceOnce(
  src,
  "                <select value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)}>\n                  <option value=\"\">{t('saneamiento_seleccionar_categoria')}</option>\n                  {categorias.map((c) => (\n                    <option key={c.estructura_id} value={c.estructura_id}>\n                      {c.icono} {c.nombre_cuenta}\n                    </option>\n                  ))}\n                </select>",
  "                <select value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)}>\n                  <option value=\"\">{t('saneamiento_seleccionar_categoria')}</option>\n                  {categorias.map((g) =>\n                    g.hijos.length > 0 ? (\n                      <optgroup key={g.estructura_id} label={`${g.icono} ${g.nombre_cuenta}`}>\n                        {g.hijos.map((h) => (\n                          <option key={h.estructura_id} value={h.estructura_id}>\n                            {h.icono} {h.nombre}\n                          </option>\n                        ))}\n                      </optgroup>\n                    ) : (\n                      <option key={g.estructura_id} value={g.estructura_id}>\n                        {g.icono} {g.nombre_cuenta}\n                      </option>\n                    )\n                  )}\n                </select>",
  'render-grupos'
);

fs.writeFileSync(FILE, src);
console.log('jerarquia OK');