import { useState, useMemo } from 'react'
import { t } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './MigrarSubcategoriaModal.css'

export interface CategoriaPickerOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  es_padre: boolean
}

interface MigrarSubcategoriaModalProps {
  isOpen: boolean
  categorias: CategoriaPickerOption[]
  onSelect: (cat: CategoriaPickerOption) => void
  onCancel: () => void
}

export function MigrarSubcategoriaModal({ isOpen, categorias, onSelect, onCancel }: MigrarSubcategoriaModalProps) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categorias
    return categorias.filter(c => t(c.nombre_cuenta).toLowerCase().includes(q))
  }, [categorias, query])

  const handleSelect = (cat: CategoriaPickerOption) => {
    setSelectedId(cat.estructura_id)
  }

  const handleConfirm = () => {
    const cat = categorias.find(c => c.estructura_id === selectedId)
    if (!cat) return
    onSelect(cat)
  }

  if (!isOpen) return null

  return (
    <div className="migrate-picker-overlay" onClick={onCancel}>
      <div className="migrate-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="migrate-picker-header">
          <h3 className="migrate-picker-title">{t('migrar_category_destino_step1')}</h3>
          <button type="button" className="migrate-picker-close" onClick={onCancel}>✕</button>
        </div>

        <div className="migrate-picker-search-wrap">
          <span className="migrate-picker-search-icon"><CategoryIcon name="Search" size={18} /></span>
          <input
            className="migrate-picker-search"
            placeholder={t('placeholder_search_category')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="migrate-picker-list">
          {filtered.length === 0 ? (
            <div className="migrate-picker-empty">{t('migrar_category_no_destinos')}</div>
          ) : (
            filtered.map(cat => {
              const isSelected = selectedId === cat.estructura_id
              return (
                <button
                  key={cat.estructura_id}
                  type="button"
                  className={`migrate-picker-item ${isSelected ? 'selected' : ''} ${cat.es_padre ? 'is-parent' : 'is-child'}`}
                  onClick={() => handleSelect(cat)}
                  aria-selected={isSelected}
                >
                  <span
                    className="migrate-picker-icon"
                    style={{ backgroundColor: cat.color || 'var(--surface-2)', color: '#000000' }}
                  >
                    <CategoryIcon name={cat.icono || 'Tag'} size={cat.es_padre ? 20 : 18} />
                  </span>
                  <span className="migrate-picker-label">{t(cat.nombre_cuenta)}</span>
                  {cat.es_padre && <span className="migrate-picker-badge">{t('cat_rubro_new_btn').replace(/^\+\s*/, '')}</span>}
                </button>
              )
            })
          )}
        </div>

        <div className="migrate-picker-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onCancel}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary font-semibold"
            onClick={handleConfirm}
            disabled={selectedId === null}
          >
            {t('btn_elegir')}
          </button>
        </div>
      </div>
    </div>
  )
}
