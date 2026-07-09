import React, { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import '@/pages/Categorias/Categorias.css'

// ─── Constantes ────────────────────────────────────────────────────────────
const EMOJIS = ['🍔','🛒','🚗','🏠','🩺','🎓','💸','✈️','🎮','🏋️','👚','🧼','🍿','👶','🐾','💈','🎁','🔌','🎵','📱','💡','🍷','🎯','📚','🏖️','🐶','🌿','🍕']
const COLORS = ['#1F2937','#4B5563','#9CA3AF','#F3F4F6','#EF4444','#F97316','#F59E0B','#10B981','#3B82F6','#8B5CF6']

export interface Hijo {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  utilidad_placer?: number
  flexibilidad_recorte?: number
  es_hormiga?: boolean
  color?: string
}

export interface Rubro {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color: string
  tipo_cupo: string
  hijos: Hijo[]
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────
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

function SliderBCG({ label, emoji, value, onChange }: {
  label: string; emoji: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="bcg-slider-wrap">
      <div className="bcg-slider-header">
        <span>{emoji} {label}</span>
        <span className="bcg-slider-value">{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value}
        className="bcg-slider"
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

// ─── Modal principal unificado ────────────────────────────────────────────────
export function SubcuentaModal({ subcuenta, rubroId, rubros, onClose, onSaved }: {
  subcuenta: Hijo | null
  rubroId: number
  rubros: Rubro[]
  onClose: () => void
  onSaved: (newId?: number, nombre?: string, icono?: string) => void
}) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState(subcuenta ? t(subcuenta.nombre_cuenta) : '')
  const [padreId, setPadreId] = useState(rubroId)

  const parentRubro = rubros.find(r => r.estructura_id === padreId)
  const parentColor = parentRubro?.color ?? COLORS[0]

  const [icono, setIcono] = useState(subcuenta?.icono ?? parentRubro?.icono ?? '▪️')
  const [utilidad, setUtilidad] = useState(subcuenta?.utilidad_placer ?? 5)
  const [flexibilidad, setFlexibilidad] = useState(subcuenta?.flexibilidad_recorte ?? 5)
  const [esHormiga, setEsHormiga] = useState(subcuenta?.es_hormiga ?? false)

  useEffect(() => {
    if (!subcuenta) {
      const parent = rubros.find(r => r.estructura_id === padreId)
      if (parent) {
        setIcono(parent.icono)
      }
    }
  }, [padreId, rubros, subcuenta])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return showToast('El nombre es obligatorio', 'error')
    setLoading(true)
    try {
      let savedId = subcuenta?.estructura_id

      if (subcuenta) {
        await rpc('fn_modificar_subcuenta_egreso', {
          p_subcuenta_id: subcuenta.estructura_id,
          p_nombre: nombre.trim(),
          p_descripcion: '',
          p_icono: icono,
          p_es_deseo: false,
          p_es_hormiga: esHormiga,
          p_utilidad_placer: utilidad,
          p_flexibilidad_recorte: flexibilidad,
        })
        showToast('Subcuenta actualizada', 'success')
      } else {
        const res = await rpc<number>('fn_crear_subcuenta_egreso', {
          p_padre_id: padreId,
          p_nombre: nombre.trim(),
          p_descripcion: '',
          p_icono: icono,
          p_es_deseo: false,
          p_es_hormiga: esHormiga,
          p_utilidad_placer: utilidad,
          p_flexibilidad_recorte: flexibilidad,
        })
        savedId = Number(res)
        showToast('Subcuenta creada', 'success')
      }
      onSaved(savedId, nombre.trim(), icono)
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cat-modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div className="cat-modal" onClick={e => e.stopPropagation()}>
        <div className="cat-modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: parentColor,
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
          <h3 className="font-display" style={{ margin: 0 }}>{subcuenta ? '✏️ Editar Subcuenta' : '➕ Nueva Subcuenta'}</h3>
          <button className="cat-modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="cat-modal-body">
          {!subcuenta && (
            <>
              <label className="cat-label">Rubro Padre</label>
              <select className="form-control mb-3" value={padreId}
                onChange={e => setPadreId(Number(e.target.value))} disabled={loading}>
                {rubros.map(r => (
                  <option key={r.estructura_id} value={r.estructura_id}>
                    {r.icono} {t(r.nombre_cuenta)}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="cat-label">Nombre</label>
          <input className="form-control mb-3" value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            enterKeyHint="next"
            placeholder="Ej: Supermercado" required disabled={loading} />

          <label className="cat-label">Ícono</label>
          <EmojiPicker value={icono} onChange={setIcono} selectedColor={parentColor} />

          <div className="bcg-section mt-3">
            <div className="bcg-section-title">🎯 Calibración BCG (Fase 6)</div>
            <SliderBCG label="Utilidad / Placer" emoji="🎢" value={utilidad} onChange={setUtilidad} />
            <SliderBCG label="Flexibilidad de Recorte" emoji="✂️" value={flexibilidad} onChange={setFlexibilidad} />
          </div>

          <div className="cat-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : subcuenta ? 'Actualizar' : 'Crear Subcuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
