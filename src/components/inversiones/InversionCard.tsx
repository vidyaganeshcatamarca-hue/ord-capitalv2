import type { KeyboardEvent } from 'react'
import { t } from '@/locales/i18n'
import { formatCurrency, formatCurrencyNumber } from '@/lib/format'
import { investmentGainAmount, investmentNetCapital } from '@/lib/inversionesPatrimonio'
import './InversionCard.css'
import { useFormatRevision } from '@/hooks/useFormatRevision'

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
  /** Retiros parciales ya cobrados: no son pérdida (S2, ronda 5). */
  monto_liquidado?: number
}

/** Un retiro parcial, tal como lo devuelve fn_retiros_inversiones. */
export interface RetiroParcial {
  monto: number
  fecha: string | null
}

interface InversionCardProps {
  inversion: Inversion
  /** Los retiros, uno por uno (S3, ronda 6). El contenedor los trae de
   *  fn_retiros_inversiones; la tarjeta no los busca por su cuenta. */
  retiros?: RetiroParcial[]
  onUpdateValue?: (id: number) => void
  onLiquidate?: (id: number) => void
  /** S6 (ronda 5): sumar capital a esta inversión, sin crear una nueva. */
  onAddCapital?: (id: number) => void
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

function formatGain(value: number | null, currency: string): string {
  if (value === null) return '-'
  const formatted = formatCurrency(value, currency)
  if (value > 0) return `+${formatted}`
  return formatted
}

export function InversionCard({
  inversion,
  retiros,
  onUpdateValue,
  onLiquidate,
  onAddCapital,
  onSelect,
}: InversionCardProps) {
  // Formato por moneda: se re-renderiza cuando cambia el contexto.
  useFormatRevision()
  const ganancia = investmentGainAmount(inversion)
  const capitalNeto = investmentNetCapital(inversion)
  const retirado = Number(inversion.monto_liquidado ?? 0)
  const retirosDeLaInversion = retiros ?? []
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
  // S6: "deberíamos tener un tercer botón, quizás más pequeño, que diga algo parecido a
  // agregar capital". No aplica a una inversión ya finalizada.
  const showAddCapitalButton = Boolean(onAddCapital) && inversion.estado_inversion !== 'finalizada'

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
        <div className="inversion-card-metric inversion-card-metric--stacked">
          <span className="inversion-card-label">{t('label_capital')}</span>
          {/* S2 (ronda 5, dueño): "el capital original debería ser el capital inicial
              menos los retiros y aparecer en un lugar, entre paréntesis por ejemplo,
              los retiros que se hicieron. ej: Original capital (1000000) - (350000) :
              650000". La cifra grande es el capital neto; el desglose va debajo y sólo
              aparece cuando hubo retiros. */}
          <span className="inversion-card-amount">
            {formatCurrency(capitalNeto ?? inversion.monto_invertido_original, inversion.moneda)}
          </span>
          {retirado > 0 && (
            <div className="inversion-card-capital-detail">
              {/* S3 (ronda 6, dueño): "lo que está entre paréntesis, incluye el nombre de
                  la moneda ... el nombre de la moneda es redundante, porque ya está el
                  nombre de la moneda antes". El desglose va sin símbolo ni código: la
                  moneda ya la dice la cifra grande de arriba. */}
              <span className="inversion-card-capital-breakdown">
                {t('label_capital_breakdown', {
                  initial: formatCurrencyNumber(inversion.monto_invertido_original, inversion.moneda),
                  withdrawn: formatCurrencyNumber(retirado, inversion.moneda),
                })}
              </span>
              {/* S3 (ronda 6, dueño): "a medida que se van haciendo retiros, tienen que
                  irse sumando los retiros abajo ... como una lista de retiros si hubiera
                  más de uno". Con UN solo retiro el paréntesis ya lo dice, y mostrarlo
                  también en la lista lo repetía dos veces (dueño, 2026-10-26: "estás
                  repitiendo dos veces la extracción en Bitcoin"): la lista es para cuando
                  hay más de uno. */}
              {retirosDeLaInversion.length > 1 && (
                <ul className="inversion-card-withdrawals">
                  {retirosDeLaInversion.map((retiro, idx) => (
                    <li
                      key={`${retiro.fecha ?? 's-f'}-${idx}`}
                      className="inversion-card-withdrawal"
                    >
                      −{formatCurrencyNumber(retiro.monto, inversion.moneda)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="inversion-card-metric">
          <span className="inversion-card-label">{t('label_current_value')}</span>
          <span className="inversion-card-amount">
            {formatCurrency(inversion.valor_actual_teorico, inversion.moneda)}
          </span>
        </div>
        <div className="inversion-card-metric">
          <span className="inversion-card-label">{t('label_gain')}</span>
          {/* Dueño, 2026-10-23: "debe mostrar la ganancia en número, no el
              porcentaje". Es la resta valor actual - capital, con los dos
              números que la tarjeta ya muestra arriba. */}
          <span className={gainClassFor(ganancia ?? 0)}>
            {formatGain(ganancia, inversion.moneda)}
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

        {(showUpdateButton || showLiquidateButton || showAddCapitalButton) && (
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
            {showAddCapitalButton && (
              <button
                type="button"
                className="inversion-card-btn inversion-card-btn--add"
                onClick={(e) => {
                  e.stopPropagation()
                  onAddCapital?.(inversion.inversion_id)
                }}
              >
                ➕ {t('btn_add_capital')}
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
