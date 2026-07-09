import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { SubcuentaModal } from '@/components/SubcuentaModal/SubcuentaModal'
import './Categorias.css'

// ─── Constantes ────────────────────────────────────────────────────────────
const EMOJIS = ['🍔','🛒','🚗','🏠','🩺','🎓','💸','✈️','🎮','🏋️','👚','🧼','🍿','👶','🐾','💈','🎁','🔌','🎵','📱','💡','🍷','🎯','📚','🏖️','🐶','🌿','🍕']
const COLORS = ['#1F2937','#4B5563','#9CA3AF','#F3F4F6','#EF4444','#F97316','#F59E0B','#10B981','#3B82F6','#8B5CF6']
const CUPOS = [
  { value: 'need',       label: 'Necesidad', desc: 'Gastos obligatorios / fijos' },
  { value: 'want',       label: 'Deseo',      desc: 'Ocio, placer, gustos' },
  { value: 'saving',     label: 'Ahorro',     desc: 'Metas, previsión' },
  { value: 'investment', label: 'Inversión',  desc: 'Activos financieros' },
  { value: 'tithe',      label: 'Diezmo',     desc: 'Donaciones, aportes' },
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
          <span style={value === e && selectedColor ? { filter: 'brightness(0)' } : {}}>{e}</span>
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
    if (!nombre.trim()) return showToast('El nombre es obligatorio', 'error')
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
        showToast('Rubro actualizado', 'success')
      } else {
        await rpc('fn_crear_cuenta_egreso', {
          p_nombre: nombre.trim(),
          p_descripcion: '',
          p_tipo_cupo: tipoCupo,
          p_icono: icono,
          p_color: color,
        })
        showToast('Rubro creado', 'success')
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
            fontSize: '22px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            flexShrink: 0,
            color: '#000000'
          }}>
            <span style={{ filter: 'brightness(0)' }}>{icono}</span>
          </div>
          <h3 className="font-display" style={{ margin: 0 }}>{rubro ? '✏️ Editar Rubro' : '➕ Nuevo Rubro'}</h3>
          <button className="cat-modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="cat-modal-body">
          <label className="cat-label">Nombre</label>
          <input className="form-control mb-3" value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            enterKeyHint="next"
            placeholder="Ej: Alimentación" required disabled={loading} />

          <label className="cat-label">Clasificación Presupuestaria</label>
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

          <label className="cat-label">Ícono</label>
          <EmojiPicker value={icono} onChange={setIcono} selectedColor={color} />

          <label className="cat-label mt-3">Color</label>
          <ColorPicker value={color} onChange={setColor} />

          <div className="cat-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : rubro ? 'Actualizar' : 'Crear Rubro'}
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
    if (!nombre.trim()) return showToast('El nombre es obligatorio', 'error')
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
        showToast('Fuente de ingreso actualizada', 'success')
      } else {
        await rpc('fn_crear_ingreso_personalizado', {
          p_nombre: nombre.trim(),
          p_descripcion: descripcion.trim() || '',
          p_icono: icono,
          p_color: color,
        })
        showToast('Fuente de ingreso creada', 'success')
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
            fontSize: '22px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            flexShrink: 0,
            color: '#000000'
          }}>
            <span style={{ filter: 'brightness(0)' }}>{icono}</span>
          </div>
          <h3 className="font-display" style={{ margin: 0 }}>{ingreso ? '✏️ Editar Fuente' : '➕ Nueva Fuente'}</h3>
          <button className="cat-modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="cat-modal-body">
          <label className="cat-label">Nombre</label>
          <input
            id="ingreso-nombre"
            className="form-control mb-3"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Salario, Freelance, Alquiler"
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

          <label className="cat-label">Descripción (opcional)</label>
          <input
            id="ingreso-descripcion"
            className="form-control mb-3"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Ej: Ingreso mensual fijo"
            disabled={loading}
            enterKeyHint="next"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />

          <label className="cat-label">Ícono</label>
          <EmojiPicker value={icono} onChange={setIcono} selectedColor={color} />

          <label className="cat-label mt-3">Color</label>
          <ColorPicker value={color} onChange={setColor} />

          <div className="cat-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : ingreso ? 'Actualizar' : 'Crear Fuente'}
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
    rubros.filter(r =>
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
    necesidad: 'Necesidad', deseo: 'Deseo', diezmo: 'Diezmo',
    ahorro: 'Ahorro', inversion: 'Inversión',
    need: 'Necesidad', want: 'Deseo',
  }

  return (
    <div className="cat-tab-content">
      {/* Barra búsqueda + botón nuevo */}
      <div className="cat-toolbar">
        <div className="cat-search-wrap">
          <span className="cat-search-icon">🔍</span>
          <input className="cat-search" placeholder="Buscar categoría..." value={query}
            onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-primary cat-new-btn"
          onClick={() => setRubroModal({ open: true, rubro: null })}>
          + Rubro
        </button>
      </div>

      {loading ? (
        <div className="cat-loading"><div className="spinner" /></div>
      ) : filteredRubros.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">🏷️</div>
          <div className="cat-empty-title">Sin categorías</div>
          <div className="cat-empty-desc">Crea tu primer rubro para comenzar a clasificar tus gastos.</div>
          <button className="btn btn-primary mt-3" onClick={() => setRubroModal({ open: true, rubro: null })}>+ Crear Rubro</button>
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
                      <span style={{ filter: 'brightness(0)' }}>{rubro.icono}</span>
                    </div>
                    <div>
                      <div className="cat-rubro-name">{t(rubro.nombre_cuenta)}</div>
                      <div className="cat-rubro-meta">
                        <span className="cat-cupo-badge" style={{ color: cupoColor[rubro.tipo_cupo] }}>
                          {cupoLabel[rubro.tipo_cupo] ?? rubro.tipo_cupo}
                        </span>
                        <span className="cat-rubro-count">· {hijos.length} subcuenta{hijos.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="cat-rubro-actions" onClick={e => e.stopPropagation()}>
                    <button className="cat-action-btn" title="Editar rubro"
                      onClick={() => setRubroModal({ open: true, rubro })}>✏️</button>
                    <button className="cat-action-btn" title="Nueva subcuenta"
                      onClick={() => setSubModal({ open: true, hijo: null, rubroId: rubro.estructura_id })}>➕</button>
                    <button className="cat-action-btn" title="Eliminar rubro"
                      onClick={() => setDeleteConfirm({ open: true, id: rubro.estructura_id, nombre: rubro.nombre_cuenta })}>🗑️</button>
                    <span className="cat-chevron">{isOpen ? '▾' : '▸'}</span>
                  </div>
                </div>

                {/* Subcuentas */}
                {isOpen && (
                  <div className="cat-hijos">
                    {hijos.length === 0 ? (
                      <div className="cat-hijo-empty">Sin subcuentas aún</div>
                    ) : (
                      hijos.map(hijo => (
                        <div key={hijo.estructura_id} className="cat-hijo-row">
                          <div className="cat-hijo-icon" style={{
                            background: hijo.color || rubro.color,
                            borderColor: hijo.color || rubro.color,
                            color: '#000000',
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            flexShrink: 0
                          }}>
                            <span style={{ filter: 'brightness(0)' }}>{hijo.icono || rubro.icono}</span>
                          </div>
                          <span className="cat-hijo-name">{t(hijo.nombre_cuenta)}</span>
                          <div className="cat-hijo-badges">
                            {hijo.es_hormiga && <span className="cat-badge-hormiga">🐜</span>}
                            <span className="cat-badge-bcg" title="Utilidad/Placer">🎢{hijo.utilidad_placer}</span>
                            <span className="cat-badge-bcg" title="Flexibilidad">✂️{hijo.flexibilidad_recorte}</span>
                          </div>
                          <button className="cat-action-btn cat-action-sm" title="Editar subcuenta"
                            onClick={() => setSubModal({ open: true, hijo, rubroId: rubro.estructura_id })}>✏️</button>
                          <button className="cat-action-btn cat-action-sm" title="Eliminar subcuenta"
                            onClick={() => setDeleteConfirm({ open: true, id: hijo.estructura_id, nombre: hijo.nombre_cuenta })}>🗑️</button>
                        </div>
                      ))
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
        title="Eliminar Categoría"
        message={`¿Estás seguro de que deseas eliminar la categoría "${deleteConfirm.nombre}"? No se podrá recuperar.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={async () => {
          try {
            await rpc('fn_eliminar_estructura_egreso', { p_estructura_id: deleteConfirm.id })
            showToast('Categoría eliminada', 'success')
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
          <span className="cat-toolbar-text">Fuentes que generan tus ingresos</span>
        </div>
        {!hideNewBtn && (
          <button className="btn btn-primary cat-new-btn" onClick={() => setModal({ open: true, item: null })}>
            + Fuente
          </button>
        )}
      </div>

      {loading ? (
        <div className="cat-loading"><div className="spinner" /></div>
      ) : ingresos.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">💰</div>
          <div className="cat-empty-title">Sin fuentes de ingreso</div>
          <div className="cat-empty-desc">Crea las categorías de donde proviene tu dinero (Salario, Freelance, Alquiler…)</div>
          <button className="btn btn-primary mt-3" onClick={() => setModal({ open: true, item: null })}>+ Crear Fuente</button>
        </div>
      ) : (
        <div className="cat-list">
          {ingresos.map(ing => (
            <div key={ing.producto_id} className="cat-ingreso-card"
              onClick={() => setModal({ open: true, item: ing })}>
              <div className="cat-ingreso-icon" style={{ background: ing.color, borderColor: ing.color, color: '#000000' }}>
                <span style={{ filter: 'brightness(0)' }}>{ing.icono}</span>
              </div>
              <div className="cat-ingreso-info">
                <div className="cat-ingreso-name">{ing.nombre}</div>
                {ing.descripcion && <div className="cat-ingreso-desc">{ing.descripcion}</div>}
              </div>
              <div className="cat-ingreso-right">
                {ing.es_pasivo && <span className="cat-badge-pasivo">💤 Pasivo</span>}
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
  const [activeTab, setActiveTab] = useState<'egresos' | 'ingresos'>('egresos')

  return (
    <div className="page cat-page">
      <div className="cat-page-header">
        <h1 className="font-display cat-page-title">Categorías</h1>
        <p className="cat-page-subtitle">Organiza tus movimientos financieros</p>
      </div>

      {/* Switcher de tabs */}
      <div className="cat-tabs-switcher">
        <button
          className={`cat-tab-btn ${activeTab === 'egresos' ? 'active' : ''}`}
          onClick={() => setActiveTab('egresos')}
        >
          <span>📤</span> Egresos
        </button>
        <button
          className={`cat-tab-btn ${activeTab === 'ingresos' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingresos')}
        >
          <span>📥</span> Ingresos
        </button>
      </div>

      {activeTab === 'egresos' ? <TabEgresos /> : <TabIngresos />}
    </div>
  )
}
