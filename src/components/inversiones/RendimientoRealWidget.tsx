import { formatCurrency } from '@/lib/format'
import { t } from '@/locales/i18n'
import './RendimientoRealWidget.css'

export interface RendimientoData {
  total_actual: number
  total_original: number
  rendimiento_nominal: number
  rendimiento_real: number | null
  inflacion_disponible: boolean
  mensaje_key: string
  fuente_inflacion: 'api_automatica' | 'proxy_dolar' | 'desactivado'
}

interface RendimientoRealWidgetProps {
  totalPesos: number
  totalDolares: number
  rendimiento: RendimientoData
  loading?: boolean
  onConfigureInflation?: () => void
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const fixed = value.toFixed(2)
  if (value > 0) return `+${fixed}%`
  if (value < 0) return `${fixed}%`
  return `${fixed}%`
}

function yieldClassFor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'rendimiento-real-yield rendimiento-real-yield--na'
  }
  if (value > 0) return 'rendimiento-real-yield rendimiento-real-yield--positive'
  if (value < 0) return 'rendimiento-real-yield rendimiento-real-yield--negative'
  return 'rendimiento-real-yield rendimiento-real-yield--zero'
}

function verdictKeyFor(value: number | null | undefined, fallbackKey: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallbackKey
  }
  if (value > 0) return 'msg_beat_inflation'
  return 'msg_lost_purchasing_power'
}

export function RendimientoRealWidget({
  totalPesos,
  totalDolares,
  rendimiento,
  loading,
  onConfigureInflation,
}: RendimientoRealWidgetProps) {
  if (loading) {
    return (
      <header className="rendimiento-real-widget rendimiento-real-widget--loading" aria-busy="true">
        <div className="rendimiento-real-skeleton" aria-hidden="true" />
      </header>
    )
  }

  const { rendimiento_nominal, rendimiento_real, inflacion_disponible, mensaje_key } = rendimiento
  const verdictKey = verdictKeyFor(rendimiento_real, mensaje_key)
  const verdictIsPositive = rendimiento_real !== null && rendimiento_real > 0

  return (
    <header className="rendimiento-real-widget">
      <div className="rendimiento-real-row rendimiento-real-row--title">
        <h2 className="rendimiento-real-title">{t('title')}</h2>
        <span className="rendimiento-real-total-ars">
          {formatCurrency(totalPesos, 'ARS')}
        </span>
      </div>

      <div className="rendimiento-real-row rendimiento-real-row--usd">
        <span className="rendimiento-real-total-usd-label">USD</span>
        <span className="rendimiento-real-total-usd">
          {formatCurrency(totalDolares, 'USD')}
        </span>
      </div>

      <div className="rendimiento-real-row rendimiento-real-row--yields">
        {inflacion_disponible ? (
          <>
            <div className="rendimiento-real-yield-block">
              <span className="rendimiento-real-yield-label">
                {t('label_nominal_yield')}
              </span>
              <span className={yieldClassFor(rendimiento_nominal)}>
                {formatPercent(rendimiento_nominal)}
              </span>
            </div>
            <div className="rendimiento-real-yield-block">
              <span className="rendimiento-real-yield-label">
                {t('label_real_yield')}
              </span>
              <span className={yieldClassFor(rendimiento_real)}>
                {formatPercent(rendimiento_real)}
              </span>
            </div>
            <span
              className={
                verdictIsPositive
                  ? 'rendimiento-real-verdict rendimiento-real-verdict--positive'
                  : 'rendimiento-real-verdict rendimiento-real-verdict--negative'
              }
            >
              {t(verdictKey)}
            </span>
          </>
        ) : (
          <button
            type="button"
            className="rendimiento-real-cta"
            onClick={onConfigureInflation}
            disabled={!onConfigureInflation}
          >
            ⚙ {t('msg_configure_inflation')}
          </button>
        )}
      </div>
    </header>
  )
}

export default RendimientoRealWidget
