import { t } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './MigrarCategoriaModal.css'

export interface CategoriaOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  es_padre: boolean
}

interface MigrarCategoriaModalProps {
  isOpen: boolean
  origen: CategoriaOption
  destino: CategoriaOption | null
  onOpenPicker: () => void
  onMigrate: () => void
  onClose: () => void
}

export function MigrarCategoriaModal({ isOpen, origen, destino, onOpenPicker, onMigrate, onClose }: MigrarCategoriaModalProps) {
  if (!isOpen) return null

  const destinoLabel = destino ? t(destino.nombre_cuenta) : ''
  const canMigrate = destino !== null

  return (
    <div className="migrate-modal-overlay" onClick={onClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">
          {t('confirm_migrate_category', { name: t(origen.nombre_cuenta) })}
        </p>

        <label className="migrate-modal-field">
          <span>{t('migrar_category_destino_label')}</span>
        </label>

        <button
          type="button"
          className="migrate-destino-input"
          onClick={onOpenPicker}
          aria-haspopup="dialog"
          aria-expanded={false}
        >
          {destino ? (
            <span className="migrate-destino-value">
              <span
                className="migrate-destino-icon"
                style={{ backgroundColor: destino.color || 'var(--surface-2)', color: '#000000' }}
              >
                <CategoryIcon name={destino.icono || 'Tag'} size={18} />
              </span>
              {destinoLabel}
            </span>
          ) : (
            <span className="migrate-destino-placeholder">{t('migrar_category_destino_placeholder')}</span>
          )}
          <span className="migrate-destino-chevron">›</span>
        </button>

        <div className="migrate-modal-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onClose}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger font-semibold"
            onClick={onMigrate}
            disabled={!canMigrate}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}