import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import '@/pages/Categorias/Categorias.css'
import './MigrarCategoriaModal.css'

interface Hijo {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
}

interface Rubro {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  hijos: Hijo[]
}

interface RubroOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  padre_id?: number | null
}

interface MigrarCategoriaModalProps {
  isOpen: boolean
  origen: RubroOption
  onClose: () => void
  onMigrated: () => void
}

interface MigrarResponse {
  migrados_caja?: number
  migrados_presupuestos?: number
  migrados_recurrentes?: number
}

interface SeleccionDestino {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
}

export function MigrarCategoriaModal({ isOpen, origen, onClose, onMigrated }: MigrarCategoriaModalProps) {
  const { showToast } = useToast()
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [expandedRubros, setExpandedRubros] = useState<Record<number, boolean>>({})
  const [seleccion, setSeleccion] = useState<SeleccionDestino | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSeleccion(null)
      setExpandedRubros({})
      return
    }
    let cancelled = false
    async function loadRubros() {
      setLoadingTree(true)
      try {
        const data = await rpc<Rubro[]>('fn_obtener_arbol_categorias').catch(() => [] as Rubro[])
        if (!cancelled) {
          setRubros((data ?? []).filter(r => r.estructura_id !== origen.estructura_id))
        }
      } finally {
        if (!cancelled) setLoadingTree(false)
      }
    }
    loadRubros()
    return () => { cancelled = true }
  }, [isOpen, origen.estructura_id])

  const toggleExpanded = useCallback((id: number) => {
    setExpandedRubros(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleSelectRubro = useCallback((rubro: Rubro) => {
    if (rubro.hijos && rubro.hijos.length > 0) {
      // Tiene subcategorías: expandir/colapsar y NO seleccionar
      toggleExpanded(rubro.estructura_id)
    } else {
      // Sin subcategorías: seleccionar directamente
      setSeleccion({
        estructura_id: rubro.estructura_id,
        nombre_cuenta: rubro.nombre_cuenta,
        icono: rubro.icono,
        color: rubro.color
      })
    }
  }, [toggleExpanded])

  const handleSelectHijo = useCallback((rubro: Rubro, hijo: Hijo) => {
    setSeleccion({
      estructura_id: hijo.estructura_id,
      nombre_cuenta: hijo.nombre_cuenta,
      icono: hijo.icono ?? rubro.icono,
      color: hijo.color ?? rubro.color
    })
  }, [])

  const handleConfirm = async () => {
    if (!seleccion) return
    setLoading(true)
    try {
      const result = await rpc<MigrarResponse[]>('fn_migrar_y_eliminar_estructura_egreso', {
        p_estructura_id_origen: origen.estructura_id,
        p_estructura_id_destino: seleccion.estructura_id
      })
      const counts = Array.isArray(result) ? result[0] : result
      const movs = counts?.migrados_caja ?? 0
      const presup = counts?.migrados_presupuestos ?? 0
      const recurs = counts?.migrados_recurrentes ?? 0
      if (presup === 0 && recurs === 0) {
        showToast(t('success_category_migrated_caja', { count: movs }), 'success')
      } else {
        showToast(t('success_category_migrated_full', {
          movimientos: movs,
          presupuestos: presup,
          recurrentes: recurs
        }), 'success')
      }
      onMigrated()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="migrate-modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">{t('confirm_migrate_category', { name: t(origen.nombre_cuenta) })}</p>

        <div className="migrate-modal-section">
          <span className="migrate-modal-label">{t('migrar_category_destino_label')}</span>
          {loadingTree ? (
            <div className="migrate-modal-loading">
              <div className="spinner" />
            </div>
          ) : rubros.length === 0 ? (
            <div className="migrate-modal-empty">{t('cat_empty_title')}</div>
          ) : (
            <div className="cat-list">
              {rubros.map(rubro => {
                const isOpen = !!expandedRubros[rubro.estructura_id]
                const hijos = rubro.hijos ?? []
                const hasChildren = hijos.length > 0
                const isSelectedParent = seleccion?.estructura_id === rubro.estructura_id && !hasChildren
                return (
                  <div key={rubro.estructura_id} className="cat-rubro-card">
                    <div
                      className={`cat-rubro-header ${isSelectedParent ? 'cat-selected' : ''}`}
                      onClick={() => handleSelectRubro(rubro)}
                    >
                      <div className="cat-rubro-left">
                        <div
                          className="cat-rubro-icon"
                          style={{ background: rubro.color || 'var(--surface-2)', borderColor: rubro.color || 'var(--surface-2)', color: '#000000' }}
                        >
                          <CategoryIcon name={rubro.icono || 'Tag'} size={20} />
                        </div>
                        <div>
                          <div className="cat-rubro-name">{t(rubro.nombre_cuenta)}</div>
                          <div className="cat-rubro-meta">
                            <span className="cat-rubro-count">
                              {hasChildren
                                ? (hijos.length === 1
                                  ? t('cat_subcuentas_count_one', { count: hijos.length })
                                  : t('cat_subcuentas_count_other', { count: hijos.length }))
                                : t('migrar_category_no_children')}
                            </span>
                          </div>
                        </div>
                      </div>
                      {hasChildren && (
                        <span className="cat-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                      )}
                    </div>

                    {isOpen && hasChildren && (
                      <div className="cat-hijos">
                        {hijos.map((hijo) => {
                          const hijoColor: string = hijo.color || rubro.color || 'var(--surface-2)'
                          const isSelectedChild = seleccion?.estructura_id === hijo.estructura_id
                          return (
                            <div
                              key={hijo.estructura_id}
                              className={`cat-hijo-row ${isSelectedChild ? 'cat-selected' : ''}`}
                              onClick={() => handleSelectHijo(rubro, hijo)}
                            >
                              <div
                                className="cat-hijo-icon"
                                style={{
                                  background: hijoColor,
                                  borderColor: hijoColor,
                                  color: '#000000',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                <CategoryIcon name={hijo.icono || rubro.icono || 'Tag'} size={16} />
                              </div>
                              <span className="cat-hijo-name">{t(hijo.nombre_cuenta)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {seleccion && (
          <div className="migrate-modal-preview">
            <span className="migrate-modal-preview-label">{t(origen.nombre_cuenta)}</span>
            <span className="migrate-modal-preview-arrow">→</span>
            <div
              className="migrate-modal-preview-icon"
              style={{
                background: seleccion.color || 'var(--surface-2)',
                borderColor: seleccion.color || 'var(--border)',
                color: '#000000'
              }}
            >
              <CategoryIcon name={seleccion.icono || 'Tag'} size={16} />
            </div>
            <span className="migrate-modal-preview-label">{t(seleccion.nombre_cuenta)}</span>
          </div>
        )}

        <div className="migrate-modal-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onClose} disabled={loading}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger font-semibold"
            onClick={handleConfirm}
            disabled={loading || !seleccion}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
