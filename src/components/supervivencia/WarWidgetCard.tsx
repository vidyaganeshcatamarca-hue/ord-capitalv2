import { type ReactNode } from 'react'
import './WarWidgetCard.css'

interface WarWidgetCardProps {
  icon: string
  title: string
  subtitle?: string
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'neutro'
  onDetalle?: () => void
  ctaLabel?: string
  children: ReactNode
}

export type SemaforoWar = 'verde' | 'amarillo' | 'rojo' | 'neutro'

export function WarWidgetCard({
  icon,
  title,
  subtitle,
  semaforo,
  onDetalle,
  ctaLabel,
  children,
}: WarWidgetCardProps) {
  return (
    <article className={`war-widget war-widget-${semaforo}`}>
      <header className="war-widget-header">
        <div className="war-widget-title-group">
          <span className="war-widget-icon" aria-hidden="true">{icon}</span>
          <div>
            <h3 className="war-widget-title">{title}</h3>
            {subtitle && <p className="war-widget-subtitle">{subtitle}</p>}
          </div>
        </div>
        <span
          className={`war-widget-semaforo war-semaforo-${semaforo}`}
          aria-label={`Estado: ${semaforo}`}
        />
      </header>
      <div className="war-widget-body">
        {children}
      </div>
      {onDetalle && (
        <footer className="war-widget-footer">
          <button
            type="button"
            className="war-widget-cta"
            onClick={onDetalle}
          >
            {ctaLabel ?? 'Ver Detalle →'}
          </button>
        </footer>
      )}
    </article>
  )
}
