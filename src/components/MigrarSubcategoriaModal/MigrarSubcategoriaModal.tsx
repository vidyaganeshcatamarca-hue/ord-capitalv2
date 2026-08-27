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

interface RubroGroup extends CategoriaPickerOption {
  hijos: CategoriaPickerOption[]
}

export function MigrarSubcategoriaModal({ isOpen, categorias, onSelect, onCancel }: MigrarSubcategoriaModalProps) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedRubros, setExpandedRubros] = useState<Record<number, boolean>>({})

  const rubros = useMemo<RubroGroup[]>(() => {
    const result: RubroGroup[] = []
    let current: RubroGroup | null = null
    for (const cat of categorias) {
      if (cat.es_padre) {
        current = { ...cat, hijos: [] }
        result.push(current)
      } else if (current) {
        current.hijos.push(cat)
      } else {
        result.push({ ...cat, es_padre: true, hijos: [] })
      }
    }
    return result
  }, [categorias])

  const queryTrimmed = query.trim().toLowerCase()
  const hasQuery = queryTrimmed.length > 0

  const filteredRubros = useMemo<RubroGroup[]>(() => {
    if (!hasQuery) return rubros
    return rubros.reduce<RubroGroup[]>((acc, rubro) => {
      const rubroName = t(rubro.nombre_cuenta).toLowerCase()
      const rubroMatch = rubroName.includes(queryTrimmed)
      const matchedHijos = rubroMatch
        ? rubro.hijos
        : rubro.hijos.filter(h => t(h.nombre_cuenta).toLowerCase().includes(queryTrimmed))
      if (rubroMatch || matchedHijos.length > 0) {
        acc.push({ ...rubro, hijos: matchedHijos })
      }
      return acc
    }, [])
  }, [rubros, queryTrimmed, hasQuery])

  const handleToggleExpand = (rubro: RubroGroup) => {
    if (rubro.hijos.length === 0) return
    setExpandedRubros(prev => ({ ...prev, [rubro.estructura_id]: !prev[rubro.estructura_id] }))
  }

  const handleSelectRubro = (rubro: RubroGroup) => {
    if (rubro.hijos.length > 0) return
    setSelectedId(rubro.estructura_id)
    onSelect(rubro)
  }

  const handleSelectHijo = (rubro: RubroGroup, hijo: CategoriaPickerOption) => {
    const selected: CategoriaPickerOption = {
      estructura_id: hijo.estructura_id,
      nombre_cuenta: `${t(rubro.nombre_cuenta)} › ${t(hijo.nombre_cuenta)}`,
      icono: hijo.icono || rubro.icono,
      color: rubro.color,
      es_padre: false,
    }
    setSelectedId(selected.estructura_id)
    onSelect(selected)
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
          <h3 className="migrate-picker-title">{t('title_select_category')}</h3>
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

        <div className="migrate-picker-body">
          {filteredRubros.length === 0 ? (
            <div className="migrate-picker-empty">{t('migrar_category_no_destinos')}</div>
          ) : (
            <div className="migrate-cat-acordeon">
              {filteredRubros.map(rubro => {
                const hasChildren = rubro.hijos.length > 0
                const isExpanded = expandedRubros[rubro.estructura_id] || (hasQuery && hasChildren)
                return (
                  <div key={rubro.estructura_id} className="migrate-cat-acordeon-rubro">
                    <div
                      className="migrate-cat-acordeon-header"
                      onClick={() => (hasChildren ? handleToggleExpand(rubro) : handleSelectRubro(rubro))}
                    >
                      <div className="migrate-cat-acordeon-title">
                        <div
                          className="migrate-cat-acordeon-icon"
                          style={{ backgroundColor: rubro.color || 'var(--surface-2)', color: '#000000' }}
                        >
                          <CategoryIcon name={rubro.icono || 'Tag'} size={18} />
                        </div>
                        <span className="migrate-cat-acordeon-name">{t(rubro.nombre_cuenta)}</span>
                        {hasChildren && (
                          <span className="migrate-cat-acordeon-count">
                            {rubro.hijos.length === 1
                              ? t('cat_subcuentas_count_one', { count: rubro.hijos.length })
                              : t('cat_subcuentas_count_other', { count: rubro.hijos.length })}
                          </span>
                        )}
                      </div>
                      {hasChildren && (
                        <span className="migrate-cat-acordeon-chevron">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      )}
                    </div>

                    {hasChildren && isExpanded && (
                      <div className="migrate-cat-acordeon-hijos">
                        {rubro.hijos.map(hijo => (
                          <button
                            key={hijo.estructura_id}
                            type="button"
                            className="migrate-cat-acordeon-hijo"
                            onClick={() => handleSelectHijo(rubro, hijo)}
                          >
                            <span
                              className="migrate-cat-acordeon-hijo-icon"
                              style={{ backgroundColor: rubro.color || 'var(--surface-2)', color: '#000000' }}
                            >
                              <CategoryIcon name={hijo.icono || rubro.icono || 'Tag'} size={16} />
                            </span>
                            <span className="migrate-cat-acordeon-hijo-name">{t(hijo.nombre_cuenta)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
