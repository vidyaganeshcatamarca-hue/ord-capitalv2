import { useState } from 'react'
import { t } from '@/locales/i18n'
import { BCG_CUADRANTES, classifyCuadrante, formatMoneyARS } from '@/lib/bcgUtils'
import { haptics } from '@/lib/haptics'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import type { BCGPoint } from './BCGScatterPlot'
import './BCGCuadranteAcordeon.css'

interface BCGCuadranteAcordeonProps {
  cuadranteKey: string
  items: BCGPoint[]
  onItemClick: (item: BCGPoint) => void
  defaultOpen?: boolean
}

export function BCGCuadranteAcordeon({ cuadranteKey, items, onItemClick, defaultOpen = false }: BCGCuadranteAcordeonProps) {
  const [open, setOpen] = useState(defaultOpen)
  const c = classifyCuadrante(cuadranteKey)
  const total = items.reduce((acc, it) => acc + (Number(it.monto_total) || 0), 0)

  const toggle = () => {
    haptics.light()
    setOpen((v) => !v)
  }

  return (
    <div className={`bcg-acordeon ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="bcg-acordeon-header"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="bcg-acordeon-chevron" aria-hidden="true">▸</span>
        <span className="bcg-acordeon-emoji" aria-hidden="true">{c?.emoji ?? '📊'}</span>
        <span className="bcg-acordeon-label">{c ? t(c.labelKey) : cuadranteKey}</span>
        <span className="bcg-acordeon-count">{t('bcg_lista_count', { count: items.length })}</span>
        <span className="bcg-acordeon-total">{formatMoneyARS(total)}</span>
      </button>

      {open && (
        <ul className="bcg-acordeon-list" role="list">
          {items.length === 0 ? (
            <li className="bcg-acordeon-empty">{t('bcg_empty_sin_historico')}</li>
          ) : (
            items.map((it) => (
              <li
                key={it.estructura_id}
                className="bcg-acordeon-item"
                onClick={() => {
                  haptics.light()
                  onItemClick(it)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemClick(it)
                  }
                }}
              >
                <span
                  className="bcg-acordeon-item-icon"
                  style={{ background: `${it.color ?? '#6366F1'}33` }}
                  aria-hidden="true"
                >
                  <CategoryIcon name={it.icono} size={20} />
                </span>
                <div className="bcg-acordeon-item-body">
                  <strong>{it.nombre}</strong>
                  {it.rubro_padre && <span className="bcg-acordeon-item-padre">{it.rubro_padre}</span>}
                </div>
                <div className="bcg-acordeon-item-meta">
                  <span>Placer: <strong>{it.coordenada_y}/10</strong></span>
                  <span>Frec: <strong>{it.coordenada_x}/mes</strong></span>
                </div>
                <span className="bcg-acordeon-item-monto">{formatMoneyARS(it.monto_total)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export default BCGCuadranteAcordeon
