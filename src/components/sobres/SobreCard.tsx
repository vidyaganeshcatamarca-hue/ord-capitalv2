import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { t } from '@/locales/i18n'
import type { Sobre } from './types'
import './SobreCard.css'

interface SobreCardProps {
  sobre: Sobre
  onSelect: (sobre: Sobre) => void
  onProvision: (sobre: Sobre) => void
  onRescue: (sobre: Sobre) => void
  onEdit: (sobre: Sobre) => void
  onArchive: (sobre: Sobre) => void
  /** Se habilita cuando el sobre tiene al menos una porción real que genera rendimientos. */
  onYield?: (sobre: Sobre) => void
}

const claseEstado: Record<string, string> = {
  state_green: 'sobre-estado--verde',
  state_yellow: 'sobre-estado--amarillo',
  state_red: 'sobre-estado--rojo',
  state_fulfilled: 'sobre-estado--cumplido',
  state_overdue: 'sobre-estado--vencido',
  state_plan_started: 'sobre-estado--neutral',
  state_free_savings: 'sobre-estado--neutral',
  state_project: 'sobre-estado--proyecto',
}

/** La barra se frena en 100 pero el texto del porcentaje puede pasarse (DF-08). */
function anchoProgreso(valor: number | null) {
  const n = Number(valor ?? 0)
  if (!Number.isFinite(n)) return '0%'
  return `${Math.max(0, Math.min(100, n))}%`
}

function textoDias(sobre: Sobre) {
  if (sobre.fecha_objetivo === null || sobre.dias_restantes === null) return null
  if (sobre.dias_restantes < 0) return t('sobres_goal_overdue')
  if (sobre.dias_restantes === 0) return t('sobres_due_today')
  if (sobre.dias_restantes === 1) return t('sobres_days_left_one')
  return t('sobres_days_left', { dias: sobre.dias_restantes })
}

export function SobreCard({
  sobre,
  onSelect,
  onProvision,
  onRescue,
  onEdit,
  onArchive,
  onYield,
}: SobreCardProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('touchstart', cerrar)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('touchstart', cerrar)
    }
  }, [menuAbierto])

  const dias = textoDias(sobre)
  const tieneMeta = sobre.monto_meta !== null && sobre.monto_meta > 0
  const porcentaje = sobre.porcentaje_progreso ?? 0

  return (
    <article className="sobre-card">
      <button
        type="button"
        className="sobre-card-main"
        onClick={() => onSelect(sobre)}
        aria-label={sobre.nombre}
      >
        <header className="sobre-card-header">
          <h3>{sobre.nombre}</h3>
          <span className={`sobre-estado ${claseEstado[sobre.estado_key] ?? 'sobre-estado--neutral'}`}>
            {t(sobre.estado_key)}
          </span>
        </header>

        <div className="sobre-card-saldo">
          <strong>{formatCurrency(sobre.saldo, sobre.moneda)}</strong>
          {tieneMeta ? (
            <span>{t('sobres_of_goal', { meta: formatCurrency(sobre.monto_meta, sobre.moneda) })}</span>
          ) : (
            <span className="sobre-card-sinmeta">{t('sobres_no_goal')}</span>
          )}
        </div>

        {tieneMeta && (
          <div className="sobre-card-progreso" aria-hidden="true">
            <span style={{ width: anchoProgreso(sobre.porcentaje_progreso) }} />
          </div>
        )}

        {(tieneMeta || dias) && (
          <footer className="sobre-card-meta">
            {tieneMeta && <span>{porcentaje}%</span>}
            {dias && <span className={sobre.dias_restantes !== null && sobre.dias_restantes < 0 ? 'sobre-card-vencido' : ''}>{dias}</span>}
            {sobre.fecha_objetivo && !dias && <span>{formatDateShort(sobre.fecha_objetivo)}</span>}
          </footer>
        )}
      </button>

      <div className="sobre-card-acciones">
        <button type="button" className="btn btn-primary" onClick={() => onProvision(sobre)}>
          {t('sobres_provision')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onRescue(sobre)}>
          {t('sobres_rescue')}
        </button>

        <div className="sobre-card-menu" ref={menuRef}>
          <button
            type="button"
            className="sobre-card-menu-trigger"
            aria-label={t('sobres_menu_more')}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            <MoreVertical size={18} />
          </button>
          {menuAbierto && (
            <div className="sobre-card-menu-lista" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuAbierto(false)
                  onEdit(sobre)
                }}
              >
                {t('sobres_edit')}
              </button>
              {sobre.tiene_rendimiento && onYield && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAbierto(false)
                    onYield(sobre)
                  }}
                >
                  {t('sobres_yield_register')}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="sobre-card-menu-peligro"
                onClick={() => {
                  setMenuAbierto(false)
                  onArchive(sobre)
                }}
              >
                {t('sobres_archive')}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default SobreCard
