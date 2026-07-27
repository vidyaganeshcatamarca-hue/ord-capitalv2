import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { filterUserEditableCategories } from '@/lib/categoryFilters'

interface AddCategoryModalProps {
  onClose: () => void
  onSuccess: (newCatId: string, newCatName: string) => void
}

const CATEGORY_EMOJIS = ['🍔', '🛒', '🚗', '🏠', '🩺', '🎓', '💸', '✈️', '🎮', '🏋️', '👚', '🧼', '🍿', '👶', '🐾', '💈', '🎁', '🔌']
const CATEGORY_COLORS = ['#1F2937','#4B5563','#9CA3AF','#F3F4F6','#EF4444','#F97316','#F59E0B','#10B981','#3B82F6','#8B5CF6']

export function AddCategoryModal({ onClose, onSuccess }: AddCategoryModalProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [isSubcategory, setIsSubcategory] = useState(false)
  const [parentCategories, setParentCategories] = useState<any[]>([])

  // Campos comunes
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('🏷️')

  // Campos para Categoría Principal (Rubro Padre)
  const [tipoCupo, setTipoCupo] = useState('need') // need, want, Tithe, investment, saving
  const [color, setColor] = useState(CATEGORY_COLORS[4]) // Default to EF4444

  // Campos para Subcategoría (Subcuenta Hija)
  const [parentCategoryId, setParentCategoryId] = useState('')

  useEffect(() => {
    if (isSubcategory && parentCategoryId) {
      const parent = parentCategories.find(c => c.estructura_id.toString() === parentCategoryId)
      if (parent) {
        setIcono(parent.icono)
      }
    }
  }, [isSubcategory, parentCategoryId, parentCategories])

  useEffect(() => {
    const loadParents = async () => {
      try {
        const res = await rpc<any[]>('fn_obtener_arbol_categorias').catch(() => [])
        const filtered = filterUserEditableCategories(res)
        setParentCategories(filtered)
        if (filtered.length > 0) {
          setParentCategoryId(filtered[0].estructura_id.toString())
        }
      } catch (err: any) {
        showToast(parseError(err), 'error')
      }
    }
    loadParents()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      showToast(t('error_field_required', { field: 'Nombre' }), 'error')
      return
    }

    try {
      setLoading(true)
      let newId = ''
      let fullName = ''

      if (!isSubcategory) {
        // Crear Categoría Principal
        const res = await rpc<string>('fn_crear_cuenta_egreso', {
          p_nombre: nombre.trim(),
          p_descripcion: 'Creado desde el FAB',
          p_tipo_cupo: tipoCupo,
          p_icono: icono,
          p_color: color
        })
        newId = res
        fullName = `${icono} ${nombre.trim()}`
      } else {
        // Crear Subcategoría
        if (!parentCategoryId) {
          showToast(t('error_field_required', { field: 'Rubro Padre' }), 'error')
          return
        }
        const res = await rpc<string>('fn_crear_subcuenta_egreso', {
          p_padre_id: parseInt(parentCategoryId),
          p_nombre: nombre.trim(),
          p_descripcion: 'Subcuenta de egreso',
          p_icono: icono,
          p_es_deseo: tipoCupo === 'want',
          p_es_hormiga: false,
          p_utilidad_placer: 5,
          p_flexibilidad_recorte: 5
        })
        newId = res
        const pCat = parentCategories.find(c => c.estructura_id.toString() === parentCategoryId)
        fullName = pCat ? `${t(pCat.nombre_cuenta)} > ${nombre.trim()}` : nombre.trim()
      }

      showToast(t('success_category_created', { defaultValue: 'Categoría creada exitosamente' }), 'success')
      onSuccess(newId, fullName)
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="bottom-sheet-overlay" style={{ zIndex: 1020 }} onClick={onClose} />
      <div className="bottom-sheet" style={{ zIndex: 1030, maxHeight: '90%' }}>
        <div className="bottom-sheet-handle" />
        <form onSubmit={handleSubmit} style={{ padding: 'var(--space-4) var(--space-2)' }}>
          <h3 className="font-display mb-1" style={{ fontSize: '18px' }}>{t("title_create_category")}</h3>
          <p className="text-xs text-muted mb-4">{t("desc_create_category")}</p>

          {/* Selector de Tipo de Categoría */}
          <div className="movement-type-selector">
            <button
              type="button"
              className={`movement-type-btn ${!isSubcategory ? 'active' : ''}`}
              style={!isSubcategory ? { background: 'var(--surface-3)', color: 'var(--text)' } : {}}
              onClick={() => setIsSubcategory(false)}
            >
              Rubro Principal
            </button>
            <button
              type="button"
              className={`movement-type-btn ${isSubcategory ? 'active' : ''}`}
              style={isSubcategory ? { background: 'var(--surface-3)', color: 'var(--text)' } : {}}
              onClick={() => setIsSubcategory(true)}
            >
              {t("label_subcategory_child")}
            </button>
          </div>

          {/* Rubro Padre (Solo para Subcategoría) */}
          {isSubcategory && (
            <div className="form-group mb-4">
              <label className="text-xs text-muted mb-2 block font-semibold">Rubro Padre</label>
              <select
                className="form-control"
                value={parentCategoryId}
                onChange={(e) => setParentCategoryId(e.target.value)}
                required
                disabled={loading}
              >
                {parentCategories.map((c) => (
                  <option key={c.estructura_id} value={c.estructura_id}>
                    {c.icono} {t(c.nombre_cuenta)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nombre */}
          <div className="form-group mb-4">
            <label className="text-xs text-muted mb-2 block font-semibold">Nombre</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ej: Supermercado, Apps, Regalos, Delivery"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Tipo de Cupo (Solo para Principal) */}
          {!isSubcategory && (
            <div className="form-group mb-4">
              <label className="text-xs text-muted mb-2 block font-semibold">{t("label_budget_classification")}</label>
              <select
                className="form-control"
                value={tipoCupo}
                onChange={(e) => setTipoCupo(e.target.value)}
                disabled={loading}
              >
                <option value="need">Necesidades (Gastos obligatorios/fijos)</option>
                <option value="want">Deseos (Ocio, placer, gustos)</option>
                <option value="saving">{t("option_saving_desc")}</option>
                <option value="investment">{t("option_investment_desc")}</option>
                <option value="tithe">Diezmo (Donaciones, aportes)</option>
              </select>
            </div>
          )}

          {/* Selector de Iconos */}
          <div className="form-group mb-4">
            <label className="text-xs text-muted mb-2 block font-semibold">Emoji / Icono</label>
            <div className="emojis-picker-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
              {CATEGORY_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`emoji-select-btn ${icono === emoji ? 'active' : ''}`}
                  onClick={() => setIcono(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de Colores (Solo para Principal) */}
          {!isSubcategory && (
            <div className="form-group mb-5">
              <label className="text-xs text-muted mb-2 block font-semibold">{t("label_theme_color")}</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {CATEGORY_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: col,
                      border: color === col ? '3px solid var(--text)' : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      boxShadow: color === col ? '0 0 10px ' + col : 'none'
                    }}
                    onClick={() => setColor(col)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={loading}>
              Crear
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
