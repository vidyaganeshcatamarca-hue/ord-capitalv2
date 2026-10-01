// B2-fix: el campo de categoria es un input-trigger compacto; el arbol se abre
// en un overlay-picker propio del modal (no inline en el form).
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// ── 1. estado del picker ──
src = replaceOnce(
  src,
  '  const [expandedRubro, setExpandedRubro] = useState<string | null>(null)',
  '  const [expandedRubro, setExpandedRubro] = useState<string | null>(null)\n  const [pickerOpen, setPickerOpen] = useState(false)',
  'estado-picker'
);

// ── 2. el campo inline -> trigger compacto (mismo estilo del form) ──
const inlineTreeStart = '                <div className="ec-categorias-tree">';
const inlineTreeEnd = '                </div>\n              )}';
const i = src.indexOf(inlineTreeStart);
const j = src.indexOf(inlineTreeEnd, i);
if (i < 0 || j < 0) { console.error('ABORT: no encontre el bloque inline'); process.exit(1); }
const inlineBlock = src.slice(i, j + inlineTreeEnd.length);

const TRIGGER = [
  '                <button',
  '                  type="button"',
  '                  className="ec-categoria-trigger"',
  '                  onClick={() => setPickerOpen(true)}',
  '                >',
  '                  <span className="ec-categoria-trigger-label">{selectedCategoriaLabel()}</span>',
  "                  <span className=\"ec-categoria-trigger-chevron\">▼</span>",
  '                </button>\n              )}',
].join('\n');
src = src.slice(0, i) + TRIGGER + src.slice(j + inlineTreeEnd.length);

// ── 3. el label helper (antes del return) ──
src = replaceOnce(
  src,
  '  if (!isOpen) return null',
  [
    '  // Trigger label: the resolved selection, or the field placeholder.',
    '  const selectedCategoriaLabel = (): string => {',
    '    const idNum = Number(estructuraId)',
    '    for (const g of categorias) {',
    '      if (g.estructura_id === idNum) return `${g.icono} ${g.nombre_cuenta}`',
    '      const hijo = (g.hijos ?? []).find((h) => h.estructura_id === idNum)',
    '      if (hijo) return `${hijo.icono} ${hijo.nombre}`',
    '    }',
    "    return t('saneamiento_seleccionar_categoria')",
    '  }',
    '',
    '  if (!isOpen) return null',
  ].join('\n'),
  'label-helper'
);

// ── 4. el overlay-picker con el arbol (despues del </form> de la modal-content) ──
const PICKER = [
  '',
  '        {pickerOpen && (',
  '          <div className="ec-picker-overlay" onClick={() => setPickerOpen(false)}>',
  '            <div className="ec-picker-sheet" onClick={(e) => e.stopPropagation()}>',
  '              <div className="ec-picker-header">',
  "                <span className=\"ec-picker-title\">{t('saneamiento_categoria')}</span>",
  "                <button className=\"ec-picker-close\" onClick={() => setPickerOpen(false)} aria-label={t('btn_close')}>✕</button>",
  '              </div>',
  '              <div className="ec-categorias-tree">',
  '                {categorias.map((g) => {',
  '                  const isGroup = g.hijos.length > 0',
  '                  const isExpanded = expandedRubro === String(g.estructura_id)',
  '                  return (',
  '                    <div key={g.estructura_id} className="ec-rubro-group">',
  '                      <div className="ec-rubro-row">',
  '                        {isGroup ? (',
  '                          // A parent with children is a heading, never a',
  '                          // selectable leaf: expenses point at a real subaccount.',
  '                          <div className="ec-rubro-heading">',
  '                            <span className="ec-rubro-icon">{g.icono}</span>',
  '                            <span className="ec-rubro-name">{g.nombre_cuenta}</span>',
  '                          </div>',
  '                        ) : (',
  '                          <button',
  '                            type="button"',
  '                            className={`ec-opcion${Number(estructuraId) === g.estructura_id ? \' is-selected\' : \'\'}`}',
  '                            onClick={() => { setEstructuraId(String(g.estructura_id)); setPickerOpen(false) }}',
  '                          >',
  '                            <span className="ec-rubro-icon">{g.icono}</span>',
  '                            <span className="ec-rubro-name">{g.nombre_cuenta}</span>',
  '                          </button>',
  '                        )}',
  '                        {isGroup && (',
  '                          <button',
  '                            type="button"',
  '                            className="ec-expand-btn"',
  '                            onClick={() => setExpandedRubro(isExpanded ? null : String(g.estructura_id))}',
  '                            aria-label={isExpanded ? t(\'btn_collapse\') : t(\'btn_expand\')}',
  '                          >',
  "                            {isExpanded ? '▲' : '▼'}",
  '                          </button>',
  '                        )}',
  '                      </div>',
  '                      {isGroup && isExpanded && (',
  '                        <div className="ec-children">',
  '                          {g.hijos.map((h) => (',
  '                            <button',
  '                              key={h.estructura_id}',
  '                              type="button"',
  '                              className={`ec-opcion ec-opcion-hijo${Number(estructuraId) === h.estructura_id ? \' is-selected\' : \'\'}`}',
  '                              onClick={() => { setEstructuraId(String(h.estructura_id)); setPickerOpen(false) }}',
  '                            >',
  '                              <span className="ec-rubro-icon">{h.icono}</span>',
  '                              <span className="ec-rubro-name">{h.nombre}</span>',
  '                            </button>',
  '                          ))}',
  '                        </div>',
  '                      )}',
  '                    </div>',
  '                  )',
  '                })}',
  '              </div>',
  '            </div>',
  '          </div>',
  '        )}',
].join('\n');

// anclar despues del cierre del form dentro de modal-content
const formClose = '        </form>\n      </div>\n    </div>\n  )';
src = replaceOnce(src, formClose, '        </form>\n' + PICKER + '\n      </div>\n    </div>\n  )', 'picker-anchor');

fs.writeFileSync(FILE, src);
console.log('B2-fix OK');