import type { KeyboardEvent } from 'react'
import { t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import './InversionCard.css'

export interface Inversion {
  inversion_id: number
  nombre_activo: string
  tipo_activo: 'plazo_fijo' | 'variable' | string
  monto_invertido_original: number
  valor_actual_teorico: number
  rendimiento_nominal: number
  dias_desde_conciliacion: number
  estado_semaforo_key: 'green' | 'yellow' | 'red' | string
  estado_inversion: string
  tasa_anual_tna: number
  moneda: string
  fecha_inicio: string
  ultima_conciliacion: string
}

interface InversionCardProps {
  inversion: Inversion
  onUpdateValue?: (id: number) => void
  onLiquidate?: (id: number) => void
  onSelect?: (id: number) => void
}

function badgeClassFor(tipo: string): string {
  if (tipo === 'plazo_fijo') return 'inversion-card-badge inversion-card-badge--pf'
  if (tipo === 'variable') return 'inversion-card-badge inversion-card-badge--var'
  return 'inversion-card-badge inversion-card-badge--other'
}

function badgeKeyFor(tipo: string): string {
  if (tipo === 'plazo_fijo') return 'badge_plazo_fijo'
  if (tipo === 'variable') return 'badge_variable'
  return 'badge_plazo_fijo'
}

function semaforoEmoji(key: string): string {
  if (key === 'green') return '🟢'
  if (key === 'yellow') return '🟡'
  if (key === 'red') return '🔴'
  return '⚪'
}

function gainClassFor(value: number): string {
  if (value > 0) return 'inversion-card-amount inversion-card-amount--positive'
  if (value < 0) return 'inversion-card-amount inversion-card-amount--negative'
  return 'inversion-card-amount inversion-card-amount--zero'
}

function formatGain(value: number, currency: string): string {
  const formatted = formatCurrency(value, currency)
  if (value > 0) return `+${formatted}`
  return formatted
}

export function InversionCard({
  inversion,
  onUpdateValue,
  onLiquidate,
  onSelect,
}: InversionCardProps) {
  const handleCardClick = () => {
    if (onSelect) onSelect(inversion.inversion_id)
  }

  const handleCardKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!onSelect) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(inversion.inversion_id)
    }
  }

  const showUpdateButton = inversion.tipo_activo === 'variable' && Boolean(onUpdateValue)
  const showLiquidateButton = Boolean(onLiquidate)

  return (
    <article
      className="inversion-card"
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? handleCardClick : undefined}
      onKeyDown={onSelect ? handleCardKeyDown : undefined}
    >
      <header className="inversion-card-header">
        <h4 className="inversion-card-title">{inversion.nombre_activo}</h4>
        <span className={badgeClassFor(inversion.tipo_activo)}>
          {t(badgeKeyFor(inversion.tipo_activo))}
        </span>
      </header>

      <div className="inversion-card-metrics">
        <div className="inversion-card-metric">
          <span className="inversion-card-label">{t('label_capital')}</span>
          <span className="inversion-card-amount">
            {formatCurrency(inversion.monto_invertido_original, inversion.moneda)}
          </span>
        </div>
        <div className="inversion-card-metric">
          <span className="inversion-card-label">{t('label_current_value')}</span>
          <span className="inversion-card-amount">
            {formatCurrency(inversion.valor_actual_teorico, inversion.moneda)}
          </span>
        </div>
        <div className="inversion-card-metric">
          <span className="inversion-card-label">{t('label_gain')}</span>
          <span className={gainClassFor(inversion.rendimiento_nominal)}>
            {formatGain(inversion.rendimiento_nominal, inversion.moneda)}
          </span>
        </div>
      </div>

      <footer className="inversion-card-footer">
        <div className="inversion-card-semaforo-block">
          <span
            className="inversion-card-semaforo-dot"
            aria-hidden="true"
          >
            {semaforoEmoji(inversion.estado_semaforo_key)}
          </span>
          <span className="inversion-card-days">
            {inversion.dias_desde_conciliacion} {t('days_since_conciliation')}
          </span>
        </div>

        {(showUpdateButton || showLiquidateButton) && (
          <div className="inversion-card-actions">
            {showUpdateButton && (
              <button
                type="button"
                className="inversion-card-btn inversion-card-btn--update"
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdateValue?.(inversion.inversion_id)
                }}
              >
                📊 {t('btn_update_value')}
              </button>
            )}
            {showLiquidateButton && (
              <button
                type="button"
                className="inversion-card-btn inversion-card-btn--liquidate"
                onClick={(e) => {
                  e.stopPropagation()
                  onLiquidate?.(inversion.inversion_id)
                }}
              >
                💸 {t('btn_liquidate')}
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  )
}

export default InversionCard
