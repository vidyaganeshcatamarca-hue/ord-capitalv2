import { useMemo, useState } from 'react'
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
  const [destinoId, setDestinoId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)

  const destinosOrdenados = useMemo(
    () => [...destinos].sort((a, b) => a.nombre_cuenta.localeCompare(b.nombre_cuenta, 'es')),
    [destinos]
  )

  const handleConfirm = async () => {
    if (destinoId === '' || destinoId === origen.estructura_id) return
    setLoading(true)
    try {
      const result = await rpc<MigrarResponse[]>('fn_migrar_y_eliminar_estructura_egreso', {
        p_estructura_id_origen: origen.estructura_id,
        p_estructura_id_destino: destinoId
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

        <label className="migrate-modal-field">
          <span>{t('migrar_category_destino_label')}</span>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={loading}
            aria-label={t('migrar_category_destino_label')}
          >
            <option value="">{t('migrar_category_destino_placeholder')}</option>
            {destinosOrdenados.map((d) => (
              <option key={d.estructura_id} value={d.estructura_id}>
                {t(d.nombre_cuenta)}
              </option>
            ))}
          </select>
        </label>

        {destinoId !== '' && (
          <div className="migrate-modal-preview">
            <div className="migrate-modal-preview-item">
              <div className="migrate-modal-preview-icon" style={{ background: origen.color || 'var(--surface-2)', borderColor: origen.color || 'var(--border)', color: '#000000' }}>
                <CategoryIcon name={origen.icono || 'Tag'} size={16} />
              </div>
              <span className="migrate-modal-preview-label">{t(origen.nombre_cuenta)}</span>
              <span className="migrate-modal-preview-arrow">→</span>
              <div className="migrate-modal-preview-icon" style={{ background: destinosOrdenados.find(d => d.estructura_id === destinoId)?.color || 'var(--surface-2)', borderColor: destinosOrdenados.find(d => d.estructura_id === destinoId)?.color || 'var(--border)', color: '#000000' }}>
                <CategoryIcon name={destinosOrdenados.find(d => d.estructura_id === destinoId)?.icono || 'Tag'} size={16} />
              </div>
              <span className="migrate-modal-preview-label">{t(destinosOrdenados.find(d => d.estructura_id === destinoId)?.nombre_cuenta || '')}</span>
            </div>
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
            disabled={loading || destinoId === '' || destinoId === origen.estructura_id}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
