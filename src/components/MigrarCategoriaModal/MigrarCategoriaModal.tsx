import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './MigrarCategoriaModal.css'

interface RubroOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  padre_id?: number | null
  hijos?: RubroOption[]
}

interface MigrarCategoriaModalProps {
  isOpen: boolean
  origen: RubroOption
  destinos: RubroOption[]
  onClose: () => void
  onMigrated: () => void
}

interface MigrarResponse {
  migrados_caja?: number
  migrados_presupuestos?: number
  migrados_recurrentes?: number
}

export function MigrarCategoriaModal({ isOpen, origen, destinos, onClose, onMigrated }: MigrarCategoriaModalProps) {
  const { showToast } = useToast()
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [destinoId, setDestinoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const selectedParent = selectedParentId === null
    ? null
    : destinos.find(r => r.estructura_id === selectedParentId) ?? null

  const handleConfirm = async () => {
    if (destinoId === null || destinoId === origen.estructura_id) return
    setLoading(true)
    try {
      const result = await rpc<MigrarResponse>('fn_migrar_y_eliminar_estructura_egreso', {
        p_estructura_id_origen: origen.estructura_id,
        p_estructura_id_destino: destinoId
      })
      const counts = (Array.isArray(result) ? result[0] : result) ?? {}
      const movs = counts.migrados_caja ?? 0
      const presup = counts.migrados_presupuestos ?? 0
      const recurs = counts.migrados_recurrentes ?? 0
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

  const handleSelectParent = (rubro: RubroOption) => {
    if (rubro.estructura_id === origen.estructura_id) return
    const hijos = rubro.hijos ?? []
    if (hijos.length === 0) {
      setDestinoId(rubro.estructura_id)
      setSelectedParentId(null)
    } else {
      setSelectedParentId(rubro.estructura_id)
      setDestinoId(null)
    }
  }

  const handleSelectHijo = (hijo: RubroOption) => {
    if (hijo.estructura_id === origen.estructura_id) return
    setDestinoId(hijo.estructura_id)
  }

  const handleVolver = () => {
    setSelectedParentId(null)
    setDestinoId(null)
  }

  if (!isOpen) return null

  // Paso 1: selección de categoría padre
  const showParentStep = selectedParent === null

  return (
    <div className="migrate-modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">
          {t('confirm_migrate_category', { name: t(origen.nombre_cuenta) })}
        </p>

        {showParentStep ? (
          // Paso 1: elegir categoría destino (con sus subcategorías visibles como hint)
          <div className="cat-acordeon" role="listbox" aria-label={t('migrar_category_destino_label')}>
            {destinos.length === 0 && (
              <div className="migrate-modal-empty">{t('migrar_category_no_destinos')}</div>
            )}
            {destinos.map(rubro => {
              const hijos = rubro.hijos ?? []
              const isSelected = destinoId === rubro.estructura_id
              return (
                <div key={rubro.estructura_id} className="cat-acordeon-rubro">
                  <div
                    className="cat-acordeon-header"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.06)' : undefined
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                      onClick={() => handleSelectParent(rubro)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          backgroundColor: rubro.color || 'var(--surface-2)',
                          color: '#000000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <CategoryIcon name={rubro.icono || 'Tag'} size={18} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                        {t(rubro.nombre_cuenta)}
                      </span>
                      {hijos.length > 0 && (
                        <span style={{ color: 'var(--text-3)', fontSize: '12px', marginLeft: '4px' }}>
                          · {hijos.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {hijos.length > 0 && (
                        <span style={{ color: 'var(--text-3)', fontSize: '14px', marginRight: '6px' }}>›</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Paso 2: elegir subcategoría del padre seleccionado
          <>
            <div className="migrate-modal-subheader">
              <button type="button" className="migrate-modal-back" onClick={handleVolver} disabled={loading}>
                ‹ {t('btn_back')}
              </button>
              <span className="migrate-modal-subheader-label">{t(selectedParent.nombre_cuenta)}</span>
            </div>
            <div className="cat-acordeon" role="listbox" aria-label={t('migrar_category_destino_label')}>
              {selectedParent.hijos!.length === 0 && (
                <div className="migrate-modal-empty">{t('migrar_category_no_subcategorias')}</div>
              )}
              {selectedParent.hijos!.map(h => {
                const isSelected = destinoId === h.estructura_id
                return (
                  <button
                    key={h.estructura_id}
                    type="button"
                    className="cat-acordeon-hijo"
                    onClick={() => handleSelectHijo(h)}
                    aria-selected={isSelected}
                    style={isSelected ? { background: 'rgba(255, 255, 255, 0.10)' } : {}}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        backgroundColor: selectedParent.color || 'var(--surface-2)',
                        color: '#000000',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '6px',
                        flexShrink: 0
                      }}
                    >
                      <CategoryIcon name={h.icono || 'Tag'} size={16} />
                    </span>
                    {t(h.nombre_cuenta)}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="migrate-modal-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onClose} disabled={loading}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger font-semibold"
            onClick={handleConfirm}
            disabled={loading || destinoId === null || destinoId === origen.estructura_id}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}