import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './MigrarSubcategoriaModal.css'

interface SubcategoriaOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
}

interface MigrarSubcategoriaModalProps {
  isOpen: boolean
  origenId: number
  parent: {
    estructura_id: number
    nombre_cuenta: string
    icono?: string | null
    color?: string | null
  }
  subcategorias: SubcategoriaOption[]
  onBack: () => void
  onMigrated: () => void
  onClose: () => void
}

interface MigrarResponse {
  migrados_caja?: number
  migrados_presupuestos?: number
  migrados_recurrentes?: number
}

export function MigrarSubcategoriaModal({
  isOpen,
  origenId,
  parent,
  subcategorias,
  onBack,
  onMigrated,
  onClose
}: MigrarSubcategoriaModalProps) {
  const { showToast } = useToast()
  const [destinoId, setDestinoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (destinoId === null) return
    setLoading(true)
    try {
      const result = await rpc<MigrarResponse>('fn_migrar_y_eliminar_estructura_egreso', {
        p_estructura_id_origen: origenId,
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

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="migrate-modal-overlay" onClick={handleClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">
          {t('migrar_category_destino_step2', { parent: t(parent.nombre_cuenta) })}
        </p>

        <label className="migrate-modal-field">
          <span>{t('migrar_category_destino_label')}</span>
        </label>

        <div className="migrate-modal-subcat-list">
          {subcategorias.length === 0 ? (
            <div className="migrate-modal-empty">{t('migrar_category_no_subcategorias')}</div>
          ) : (
            subcategorias.map(s => {
              const isSelected = destinoId === s.estructura_id
              return (
                <button
                  key={s.estructura_id}
                  type="button"
                  className="migrate-modal-subcat-item"
                  onClick={() => setDestinoId(s.estructura_id)}
                  aria-selected={isSelected}
                  style={isSelected ? { background: 'rgba(255, 255, 255, 0.10)' } : {}}
                >
                  <span
                    className="migrate-modal-subcat-icon"
                    style={{
                      backgroundColor: parent.color || 'var(--surface-2)',
                      color: '#000000'
                    }}
                  >
                    <CategoryIcon name={s.icono || 'Tag'} size={16} />
                  </span>
                  <span className="migrate-modal-subcat-label">{t(s.nombre_cuenta)}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="migrate-modal-actions">
          <button
            type="button"
            className="btn btn-ghost font-semibold"
            onClick={onBack}
            disabled={loading}
          >
            ‹ {t('btn_back')}
          </button>
          <button
            type="button"
            className="btn btn-danger font-semibold"
            onClick={handleConfirm}
            disabled={loading || destinoId === null}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}