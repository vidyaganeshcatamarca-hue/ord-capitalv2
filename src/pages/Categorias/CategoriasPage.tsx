import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { SubcuentaModal } from '@/components/SubcuentaModal/SubcuentaModal'
import { isUserEditableCategory } from '@/lib/categoryFilters'
import './Categorias.css'

// ─── Constantes ────────────────────────────────────────────────────────────
const EMOJIS = ['🍔','🛒','🚗','🏠','🩺','🎓','💸','✈️','🎮','🏋️','👚','🧼','🍿','👶','🐾','💈','🎁','🔌','🎵','📱','💡','🍷','🎯','📚','🏖️','🐶','🌿','🍕']
const COLORS = ['#1F2937','#4B5563','#9CA3AF','#F3F4F6','#EF4444','#F97316','#F59E0B','#10B981','#3B82F6','#8B5CF6']
const CUPOS = [
  { value: 'need',       label: t('cat_need_label'),      desc: t('cat_need_desc') },
  { value: 'want',       label: t('cat_want_label'),      desc: t('cat_want_desc') },
  { value: 'saving',     label: t('cat_saving_label'),     desc: t('cat_saving_desc') },
  { value: 'investment', label: t('cat_investment_label'),  desc: t('cat_investment_desc') },
  { value: 'tithe',      label: t('cat_tithe_label'),     desc: t('cat_tithe_desc') },
]

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Hijo {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  utilidad_placer: number
  flexibilidad_recorte: number
  es_hormiga: boolean
  color?: string
}

interface Rubro {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color: string
  tipo_cupo: string
  hijos: Hijo[]
}

interface CategoriaIngreso {
  producto_id: number
  nombre: string
  descripcion: string
  icono: string
  color: string
  es_pasivo: boolean
}

// ─── Sub-componentes de formulario ──────────────────────────────────────────
function EmojiPicker({ value, onChange, selectedColor }: { value: string; onChange: (v: string) => void; selectedColor?: string }) {
  return (
    <div className="cat-emoji-grid">
      {EMOJIS.map(e => (
        <button key={e} type="button"
          className={`cat-emoji-btn ${value === e ? 'active' : ''}`}
          style={value === e && selectedColor ? {
            backgroundColor: selectedColor,
            borderColor: selectedColor,
            color: '#000000',
            textShadow: 'none',
            boxShadow: `0 0 10px ${selectedColor}`
          } : {}}
          onClick={() => onChange(e)}>
          <span>{e}</span>
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="cat-color-row">
      {COLORS.map(c => (
        <button key={c} type="button"
          className={`cat-color-btn ${value === c ? 'active' : ''}`}
          style={{ background: c, boxShadow: value === c ? `0 0 10px ${c}` : 'none' }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

// ─── Modal: Crear/Editar Rubro ───────────────────────────────────────────────
function RubroModal({ rubro, onClose, onSaved }: {
  rubro: Rubro | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState(rubro ? t(rubro.nombre_cuenta) : '')
  const [icono, setIcono] = useState(rubro?.icono ?? '🏷️')
  const [color, setColor] = useState(rubro?.color ?? COLORS[0])
  const [tipoCupo, setTipoCupo] = useState(rubro?.tipo_cupo ?? 'need')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return showToast(t('cat_name_required'), 'error')
    setLoading(true)
    try {
      if (rubro) {
        await rpc('fn_modificar_cuenta_egreso', {
          p_cuenta_id: rubro.estructura_id,
          p_nombre: nombre.trim(),
          p_descripcion: '',
          p_tipo_cupo: tipoCupo,
          p_icono: icono,
          p_color: color,
        })
        showToast(t('cat_rubro_updated'), 'success')
      } else {
        await rpc('fn_crear_cuenta_egreso', {
          p_nombre: nombre.trim(),
          p_descripcion: '',
          p_tipo_cupo: tipoCupo,
          p_icono: icono,
          p_color: color,
        })
        showToast(t('cat_rubro_created'), 'success')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cat-modal-overlay" onClick={onClose}>
      <div className="cat-modal" onClick={e => e.stopPropagation()}>
        <div className="cat-modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'calc(22px * var(--font-scale))',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            flexShrink: 0,
            color: '#000000'
          }}>
            <span>{icono}</span>
          </div>
          <h3 className="font-display" style={{ margin: 0 }}>{rubro ? t('cat_rubro_edit_title') : t('cat_rubro_new_title')}</h3>
          <button className="cat-modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="cat-modal-body">
          <label className="cat-label">{t('cat_label_name')}</label>
          <input className="form-control mb-3" value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            enterKeyHint="next"
            placeholder={t("placeholder_category_food")} required disabled={loading} />

          <label className="cat-label">{t("label_budget_classification")}</label>
          <div className="cat-cupo-grid mb-3">
            {CUPOS.map(c => (
              <button key={c.value} type="button"
                className={`cat-cupo-btn ${tipoCupo === c.value ? 'active' : ''}`}
                onClick={() => setTipoCupo(c.value)}>
                <span className="cat-cupo-label">{c.label}</span>
                <span className="cat-cupo-desc">{c.desc}</span>
              </button>
            ))}
          </div>

          <label className="cat-label">{t("label_icon")}</label>
          <EmojiPicker value={icono} onChange={setIcono} selectedColor={color} />

          <label className="cat-label mt-3">{t('cat_label_color')}</label>
          <ColorPicker value={color} onChange={setColor} />

          <div className="cat-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>{t('btn_cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('edit_movement_saving') : rubro ? t('cat_btn_actualizar') : t('cat_btn_crear_rubro')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Crear/Editar Fuente de Ingreso ──────────────────────────────────
function IngresoModal({ ingreso, onClose, onSaved }: {
  ingreso: CategoriaIngreso | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState(ingreso?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(ingreso?.descripcion ?? '')
  const [icono, setIcono] = useState(ingreso?.icono ?? '💰')
  const [color, setColor] = useState(ingreso?.color ?? '#4ECDC4')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return showToast(t('cat_name_required'), 'error')
    setLoading(true)
    try {
      if (ingreso) {
        await rpc('fn_editar_ingreso_personalizado', {
          p_producto_id: ingreso.producto_id,
          p_nombre: nombre.trim(),
          p_descripcion: descripcion.trim() || '',
          p_icono: icono,
          p_color: color,
          p_es_pasivo: ingreso.es_pasivo ?? false,
        })
        showToast(t('cat_fuente_updated'), 'success')
      } else {
        await rpc('fn_crear_ingreso_personalizado', {
          p_nombre: nombre.trim(),
          p_descripcion: descripcion.trim() || '',
          p_icono: icono,
          p_color: color,
        })
        showToast(t('cat_fuente_created'), 'success')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cat-modal-overlay" onClick={onClose}>
      <div className="cat-modal" onClick={e => e.stopPropagation()}>
        <div className="cat-modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'calc(22px * var(--font-scale))',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            flexShrink: 0,
            color: '#000000'
          }}>
            <span>{icono}</span>
          </div>
          <h3 className="font-display" style={{ margin: 0 }}>{ingreso ? t('cat_fuente_edit_title') : t('cat_fuente_new_title')}</h3>
          <button className="cat-modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="cat-modal-body">
          <label className="cat-label">{t('cat_label_name')}</label>
          <input
            id="ingreso-nombre"
            className="form-control mb-3"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder={t('placeholder_ingreso_nombre')}
            required
            disabled={loading}
            enterKeyHint="next"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('ingreso-descripcion')?.focus();
              }
            }}
          />

          <label className="cat-label">{t("label_desc_optional")}</label>
          <input
            id="ingreso-descripcion"
            className="form-control mb-3"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder={t('placeholder_ingreso_desc')}
            disabled={loading}
            enterKeyHint="next"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />

          <label className="cat-label">{t("label_icon")}</label>
          <EmojiPicker value={icono} onChange={setIcono} selectedColor={color} />

          <label className="cat-label mt-3">{t('cat_label_color')}</label>
          <ColorPicker value={color} onChange={setColor} />

          <div className="cat-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>{t('btn_cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('edit_movement_saving') : ingreso ? t('cat_btn_actualizar') : t('cat_btn_crear_fuente')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab: Categorías de Egresos ──────────────────────────────────────────────
export function TabEgresos() {
  const { showToast } = useToast()
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [query, setQuery] = useState('')

  // Modales
  const [rubroModal, setRubroModal] = useState<{ open: boolean; rubro: Rubro | null }>({ open: false, rubro: null })
  const [subModal, setSubModal] = useState<{ open: boolean; hijo: Hijo | null; rubroId: number }>({ open: false, hijo: null, rubroId: 0 })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number; nombre: string }>({ open: false, id: 0, nombre: '' })

  const fetchRubros = useCallback(async () => {
    setLoading(true)
    try {
      const data = await rpc<Rubro[]>('fn_obtener_arbol_categorias').catch(() => [])
      setRubros(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRubros() }, [fetchRubros])

  const toggleExpanded = (id: number) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const deferredQuery = useDeferredValue(query)
  const filteredRubros = useMemo(() =>
    rubros
      .filter(r => isUserEditableCategory(r))
      .map(r => ({
        ...r,
        // Tambien ocultamos las subcuentas de sistema que pudieran aparecer
        // dentro de un rubro editable (caso borde: estructura con hijos
        // mezcla la categoria de misterio con categorias reales).
        hijos: r.hijos?.filter(h => isUserEditableCategory(h)) ?? []
      }))
      .filter(r =>
        !deferredQuery ||
        r.nombre_cuenta.toLowerCase().includes(deferredQuery.toLowerCase()) ||
        r.hijos?.some(h => h.nombre_cuenta.toLowerCase().includes(deferredQuery.toLowerCase()))
      ),
    [rubros, deferredQuery]
  )

  const cupoColor: Record<string, string> = {
    necesidad: 'var(--mint)', deseo: 'var(--coral)', diezmo: 'var(--amber)',
    ahorro: '#9B5DE5', inversion: 'var(--blue)',
    need: 'var(--mint)', want: 'var(--coral)',
  }
  const cupoLabel: Record<string, string> = {
    necesidad: t('cat_need_label'), deseo: t('cat_want_label'), diezmo: t('cat_tithe_label'),
    ahorro: t('cat_saving_label'), inversion: t('cat_investment_label'),
    need: t('cat_need_label'), want: t('cat_want_label'),
  }

  return (
    <div className="cat-tab-content">
      {/* Barra búsqueda + botón nuevo */}
      <div className="cat-toolbar">
        <div className="cat-search-wrap">
          <span className="cat-search-icon">🔍</span>
          <input className="cat-search" placeholder={t("placeholder_search_category")} value={query}
            onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-primary cat-new-btn"
          onClick={() => setRubroModal({ open: true, rubro: null })}>
          {t('cat_rubro_new_btn')}
        </button>
      </div>

      {loading ? (
        <div className="cat-loading"><div className="spinner" /></div>
      ) : filteredRubros.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">🏷️</div>
          <div className="cat-empty-title">{t("cat_empty_title")}</div>
          <div className="cat-empty-desc">{t('cat_empty_first_rubro_desc')}</div>
          <button className="btn btn-primary mt-3" onClick={() => setRubroModal({ open: true, rubro: null })}>{t('cat_rubro_create_empty')}</button>
        </div>
      ) : (
        <div className="cat-list">
          {filteredRubros.map(rubro => {
            const isOpen = !!expanded[rubro.estructura_id]
            const hijos = rubro.hijos ?? []
            return (
              <div key={rubro.estructura_id} className="cat-rubro-card">
                {/* Cabecera del rubro */}
                <div className="cat-rubro-header" onClick={() => toggleExpanded(rubro.estructura_id)}>
                  <div className="cat-rubro-left">
                    <div className="cat-rubro-icon" style={{ background: rubro.color, borderColor: rubro.color, color: '#000000' }}>
                      <span>{rubro.icono}</span>
                    </div>
                    <div>
                      <div className="cat-rubro-name">{t(rubro.nombre_cuenta)}</div>
                      <div className="cat-rubro-meta">
                        <span className="cat-cupo-badge" style={{ color: cupoColor[rubro.tipo_cupo] }}>
                          {cupoLabel[rubro.tipo_cupo] ?? rubro.tipo_cupo}
                        </span>
                        <span className="cat-rubro-count">· {hijos.length === 1
                          ? t('cat_subcuentas_count_one', { count: hijos.length })
                          : t('cat_subcuentas_count_other', { count: hijos.length })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="cat-rubro-actions" onClick={e => e.stopPropagation()}>
                    <button className="cat-action-btn" title={t('cat_tooltip_edit_rubro')}
                      onClick={() => setRubroModal({ open: true, rubro })}>✏️</button>
                    {(hijos.length === 0 || isOpen) && (
                      <button className="cat-action-btn" title={t('cat_tooltip_new_subcuenta')}
                        onClick={() => setSubModal({ open: true, hijo: null, rubroId: rubro.estructura_id })}>➕</button>
                    )}
                    <button className="cat-action-btn" title={t('cat_tooltip_delete_rubro')}
                      onClick={() => setDeleteConfirm({ open: true, id: rubro.estructura_id, nombre: rubro.nombre_cuenta })}>🗑️</button>
                  </div>
                </div>

                {/* Subcuentas */}
                {isOpen && (
                  <div className="cat-hijos">
                    {hijos.length === 0 ? (
                      <div className="cat-hijo-empty">{t("cat_child_empty")}</div>
                    ) : (
                      hijos.map((hijo) => {
                        const hijoColor = hijo.color || rubro.color

                        return (
                          <div key={hijo.estructura_id} className="cat-hijo-row">
                            <div className="cat-hijo-icon" style={{
                              background: hijoColor,
                              borderColor: hijoColor,
                              color: '#000000',
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 'calc(14px * var(--font-scale))',
                              flexShrink: 0
                            }}>
                              <span>{hijo.icono || rubro.icono}</span>
                            </div>
                            <span className="cat-hijo-name">{t(hijo.nombre_cuenta)}</span>
                            {hijo.es_hormiga && <span className="cat-badge-hormiga">🐜</span>}
                            <button className="cat-action-btn cat-action-sm" title={t('cat_tooltip_edit_subcuenta')}
                              onClick={() => setSubModal({ open: true, hijo, rubroId: rubro.estructura_id })}>✏️</button>
                            <button className="cat-action-btn cat-action-sm" title={t('cat_tooltip_delete_subcuenta')}
                              onClick={() => setDeleteConfirm({ open: true, id: hijo.estructura_id, nombre: hijo.nombre_cuenta })}>🗑️</button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {rubroModal.open && (
        <RubroModal rubro={rubroModal.rubro} onClose={() => setRubroModal({ open: false, rubro: null })} onSaved={fetchRubros} />
      )}
      {subModal.open && (
        <SubcuentaModal
          subcuenta={subModal.hijo} rubroId={subModal.rubroId} rubros={rubros}
          onClose={() => setSubModal({ open: false, hijo: null, rubroId: 0 })}
          onSaved={fetchRubros}
        />
      )}
      <ConfirmModal
        isOpen={deleteConfirm.open}
        title={t("title_delete_category")}
        message={t('confirm_delete_category', { name: deleteConfirm.nombre })}
        confirmText={t('btn_delete')}
        cancelText={t('btn_cancel')}
        type="danger"
        onConfirm={async () => {
          try {
            await rpc('fn_eliminar_estructura_egreso', { p_estructura_id: deleteConfirm.id })
            showToast(t('success_category_deleted'), 'success')
            fetchRubros()
          } catch (err: any) {
            showToast(parseError(err), 'error')
          } finally {
            setDeleteConfirm({ open: false, id: 0, nombre: '' })
          }
        }}
        onCancel={() => setDeleteConfirm({ open: false, id: 0, nombre: '' })}
      />
    </div>
  )
}

// ─── Tab: Cuentas de Ingreso ─────────────────────────────────────────────────
export function TabIngresos({ hideNewBtn = false }: { hideNewBtn?: boolean }) {
  const { showToast } = useToast()
  const [ingresos, setIngresos] = useState<CategoriaIngreso[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item: CategoriaIngreso | null }>({ open: false, item: null })

  useEffect(() => {
    const handleOpen = () => setModal({ open: true, item: null })
    window.addEventListener('open-crear-fuente', handleOpen)
    return () => window.removeEventListener('open-crear-fuente', handleOpen)
  }, [])

  const fetchIngresos = useCallback(async () => {
    setLoading(true)
    try {
      const data = await rpc<CategoriaIngreso[]>('fn_listar_categorias_ingreso').catch(() => [])
      setIngresos(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchIngresos() }, [fetchIngresos])

  return (
    <div className="cat-tab-content">
      <div className="cat-toolbar">
        <div className="cat-toolbar-info">
          <span className="cat-toolbar-text">{t('cat_fuentes_helper')}</span>
        </div>
        {!hideNewBtn && (
          <button className="btn btn-primary cat-new-btn" onClick={() => setModal({ open: true, item: null })}>
            {t('cat_fuente_new_btn')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="cat-loading"><div className="spinner" /></div>
      ) : ingresos.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">💰</div>
          <div className="cat-empty-title">{t('cat_ingresos_empty_title')}</div>
          <div className="cat-empty-desc">{t("cat_empty_desc")}</div>
          <button className="btn btn-primary mt-3" onClick={() => setModal({ open: true, item: null })}>{t('cat_fuente_create_empty')}</button>
        </div>
      ) : (
        <div className="cat-list">
          {ingresos.map(ing => (
            <div key={ing.producto_id} className="cat-ingreso-card"
              onClick={() => setModal({ open: true, item: ing })}>
              <div className="cat-ingreso-icon" style={{ background: ing.color, borderColor: ing.color, color: '#000000' }}>
                <span>{ing.icono}</span>
              </div>
              <div className="cat-ingreso-info">
                <div className="cat-ingreso-name">{ing.nombre}</div>
                {ing.descripcion && <div className="cat-ingreso-desc">{ing.descripcion}</div>}
              </div>
              <div className="cat-ingreso-right">
                {ing.es_pasivo && <span className="cat-badge-pasivo">💤 {t('cat_badge_pasivo')}</span>}
                <span className="cat-chevron">›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <IngresoModal ingreso={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={fetchIngresos} />
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export function CategoriasPage() {
  const [activeTab, setActiveTabState] = useState<'egresos' | 'ingresos'>(() => {
    return (sessionStorage.getItem('last_categorias_tab') as 'egresos' | 'ingresos') || 'egresos'
  })

  const setActiveTab = (tab: 'egresos' | 'ingresos') => {
    setActiveTabState(tab)
    sessionStorage.setItem('last_categorias_tab', tab)
  }

  return (
    <div className="page cat-page">
      <div className="cat-page-header">
        <h1 className="font-display cat-page-title">{t("title_categories")}</h1>
        <p className="cat-page-subtitle">{t('cat_page_subtitle')}</p>
      </div>

      {/* Switcher de tabs */}
      <div className="cat-tabs-switcher">
        <button
          className={`cat-tab-btn ${activeTab === 'egresos' ? 'active' : ''}`}
          onClick={() => setActiveTab('egresos')}
        >
          <span>📤</span> {t('cat_tab_egresos')}
        </button>
        <button
          className={`cat-tab-btn ${activeTab === 'ingresos' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingresos')}
        >
          <span>📥</span> {t('cat_tab_ingresos')}
        </button>
      </div>

      {activeTab === 'egresos' ? <TabEgresos /> : <TabIngresos />}
    </div>
  )
}
