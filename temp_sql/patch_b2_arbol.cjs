// B2: el select del editor -> arbol expandible igual al filtro de Home
// (padre con hijos solo expande; hijo o padre-sin-hijos seleccionable).
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

const OLD_SELECT = [
  '                <select value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)}>',
  '                  <option value="">{t(\'saneamiento_seleccionar_categoria\')}</option>',
  '                  {categorias.map((g) =>',
  '                    g.hijos.length > 0 ? (',
  '                      <optgroup key={g.estructura_id} label={`${g.icono} ${g.nombre_cuenta}`}>',
  '                        {g.hijos.map((h) => (',
  '                          <option key={h.estructura_id} value={h.estructura_id}>',
  '                            {h.icono} {h.nombre}',
  '                          </option>',
  '                        ))}',
  '                      </optgroup>',
  '                    ) : (',
  '                      <option key={g.estructura_id} value={g.estructura_id}>',
  '                        {g.icono} {g.nombre_cuenta}',
  '                      </option>',
  '                    )',
  '                  )}',
  '                </select>',
].join('\n');

const NEW_TREE = [
  '                <div className="ec-categorias-tree">',
  '                  {categorias.length === 0 && (',
  '                    <div className="ec-tree-empty">{t(\'saneamiento_seleccionar_categoria\')}</div>',
  '                  )}',
  '                  {categorias.map((g) => {',
  '                    const isGroup = g.hijos.length > 0',
  '                    const isExpanded = expandedRubro === String(g.estructura_id)',
  '                    return (',
  '                      <div key={g.estructura_id} className="home-filter-rubro-group">',
  '                        <div className="home-filter-rubro-row">',
  '                          {isGroup ? (',
  '                            // A parent with children is a heading, never a',
  '                            // selectable leaf: expenses must point at a real',
  '                            // subaccount (its own selection is the child).',
  '                            <div className="home-filter-rubro-btn is-heading">',
  '                              <span className="home-filter-rubro-icon">{g.icono}</span>',
  '                              <span className="home-filter-rubro-name">{g.nombre_cuenta}</span>',
  '                            </div>',
  '                          ) : (',
  '                            <button',
  '                              type="button"',
  '                              className={`home-filter-rubro-btn${Number(estructuraId) === g.estructura_id ? \' is-selected\' : \'\'}`}',
  '                              onClick={() => setEstructuraId(String(g.estructura_id))}',
  '                            >',
  '                              <span className="home-filter-rubro-icon">{g.icono}</span>',
  '                              <span className="home-filter-rubro-name">{g.nombre_cuenta}</span>',
  '                            </button>',
  '                          )}',
  '                          {isGroup && (',
  '                            <button',
  '                              type="button"',
  '                              className="home-filter-expand-btn"',
  '                              onClick={() => setExpandedRubro(isExpanded ? null : String(g.estructura_id))}',
  '                              aria-label={isExpanded ? t(\'btn_collapse\') : t(\'btn_expand\')}',
  '                            >',
  '                              {isExpanded ? \'▲\' : \'▼\'}',
  '                            </button>',
  '                          )}',
  '                        </div>',
  '                        {isGroup && isExpanded && (',
  '                          <div className="home-filter-children">',
  '                            {g.hijos.map((h) => (',
  '                              <button',
  '                                key={h.estructura_id}',
  '                                type="button"',
  '                                className={`home-filter-child-btn${Number(estructuraId) === h.estructura_id ? \' is-selected\' : \'\'}`}',
  '                                onClick={() => setEstructuraId(String(h.estructura_id))}',
  '                              >',
  '                                <span className="home-filter-rubro-icon">{h.icono}</span>',
  '                                <span>{h.nombre}</span>',
  '                              </button>',
  '                            ))}',
  '                          </div>',
  '                        )}',
  '                      </div>',
  '                    )',
  '                  })}',
  '                </div>',
].join('\n');

src = replaceOnce(src, OLD_SELECT, NEW_TREE, 'render-arbol');

// estado expandedRubro
src = replaceOnce(
  src,
  '  const [categorias, setCategorias] = useState<CategoriaGrupoOption[]>([])',
  '  const [categorias, setCategorias] = useState<CategoriaGrupoOption[]>([])\n  const [expandedRubro, setExpandedRubro] = useState<string | null>(null)',
  'estado-expand'
);

// auto-expand si el item apunta a un hijo
src = replaceOnce(
  src,
  "  const billeteraMoneda = useMemo(",
  "  // When the edited movement points at a child, open its group so the\n  // current selection is visible without an extra tap.\n  useEffect(() => {\n    if (!isOpen || !estructuraId) return\n    const parent = categorias.find((g) =>\n      (g.hijos ?? []).some((h) => String(h.estructura_id) === estructuraId)\n    )\n    if (parent) setExpandedRubro(String(parent.estructura_id))\n  }, [isOpen, estructuraId, categorias])\n\n  const billeteraMoneda = useMemo(",
  'auto-expand'
);

fs.writeFileSync(FILE, src);
console.log('B2 arbol OK');