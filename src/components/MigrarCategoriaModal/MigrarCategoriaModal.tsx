import { useState } from 'react'
import { t } from '@/locales/i18n'
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
  /**
   * Llamado cuando el usuario elige un rubro destino.
   * El padre de CategoriasPage decide si:
   *  - el destino tiene subcategorías → abrir modal 3
   *  - el destino NO tiene subcategorías → ejecutar la migración directo
   */
  onSelectParent: (parent: RubroOption) => void
  onClose: () => void
}

export function MigrarCategoriaModal({ isOpen, origen, destinos, onSelectParent, onClose }: MigrarCategoriaModalProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const handleClickParent = (rubro: RubroOption) => {
    if (rubro.estructura_id === origen.estructura_id) return
    onSelectParent(rubro)
  }

  if (!isOpen) return null

  return (
    <div className="migrate-modal-overlay" onClick={onClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">
          {t('confirm_migrate_category', { name: t(origen.nombre_cuenta) })}
        </p>

        <label className="migrate-modal-field">
          <span>{t('migrar_category_destino_label')}</span>
          <span className="migrate-modal-field-hint">{t('migrar_category_destino_step1')}</span>
        </label>

        <div className="cat-acordeon" role="listbox" aria-label={t('migrar_category_destino_label')}>
          {destinos.length === 0 && (
            <div className="migrate-modal-empty">{t('migrar_category_no_destinos')}</div>
          )}
          {destinos.map(rubro => {
            const hijos = rubro.hijos ?? []
            const isHovered = hoveredId === rubro.estructura_id
            return (
              <div key={rubro.estructura_id} className="cat-acordeon-rubro">
                <div
                  className="cat-acordeon-header"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: isHovered ? 'var(--surface-3)' : undefined
                  }}
                  onMouseEnter={() => setHoveredId(rubro.estructura_id)}
                  onMouseLeave={() => setHoveredId(prev => (prev === rubro.estructura_id ? null : prev))}
                  onClick={() => handleClickParent(rubro)}
                  role="option"
                  aria-selected={false}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}>
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

        <div className="migrate-modal-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onClose}>
            {t('btn_cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}