import { formatCurrency, formatPercent } from '@/lib/format'
import { t } from '@/locales/i18n'
import './RendimientoRealWidget.css'

export interface RendimientoData {
  total_actual: number
  total_original: number
  rendimiento_nominal: number
  rendimiento_real: number | null
  inflacion_disponible: boolean
  mensaje_key: string
  fuente_inflacion: 'proxy_dolar' | 'manual' | 'desactivado'
  moneda_local?: string
  /** S12: por qué no hay inflación, para no pedir "configurar" cuando en
   *  realidad falta el dato de cotizaciones. */
  motivo_inflacion?: 'ok' | 'desactivado' | 'sin_datos' | 'manual_sin_valor'
}

/** Una línea de subtotal por moneda (patrón del hero del Home). */
export interface PortfolioLine {
  moneda: string
  total: number
}

interface RendimientoRealWidgetProps {
  totalMonedaLocal: number
  monedaLocal: string
  lineasPorMoneda: PortfolioLine[]
  rendimiento: RendimientoData
  loading?: boolean
  onConfigureInflation?: () => void
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
  totalMonedaLocal,
  monedaLocal,
  lineasPorMoneda,
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

  const { rendimiento_nominal, rendimiento_real, inflacion_disponible, mensaje_key, fuente_inflacion, motivo_inflacion } = rendimiento
  const verdictKey = verdictKeyFor(rendimiento_real, mensaje_key)
  const verdictIsPositive = rendimiento_real !== null && rendimiento_real > 0
  // B3b: con 'desactivado' el real no existe por decisión del usuario.
  const inflacionDesactivada = fuente_inflacion === 'desactivado'
  // S12 (2026-10-22): el proxy dólar es la fuente POR DEFECTO. Si el backend no
  // tiene cotizaciones todavía, no hay nada que "configurar": se dice que falta
  // el dato. El cartel de configuración queda solo para el caso real: manual sin
  // valor (o sin fila y sin default aplicable).
  const faltaConfigurar = !inflacionDesactivada && motivo_inflacion === 'manual_sin_valor'

  return (
    <header className="rendimiento-real-widget">
      <div className="rendimiento-real-row rendimiento-real-row--title">
        <h2 className="rendimiento-real-title">{t('title')}</h2>
        <span className="rendimiento-real-total-ars">
          {formatCurrency(totalMonedaLocal, monedaLocal)}
        </span>
      </div>

      {lineasPorMoneda.length > 0 && (
        <div className="rendimiento-real-row rendimiento-real-row--usd">
          {lineasPorMoneda.map((linea) => (
            <span key={linea.moneda} className="rendimiento-real-moneda-line">
              <span className="rendimiento-real-total-usd-label">{linea.moneda}</span>
              <span className="rendimiento-real-total-usd">
                {formatCurrency(linea.total, linea.moneda)}
              </span>
            </span>
          ))}
        </div>
      )}

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
        ) : inflacionDesactivada ? (
          // B3b: el usuario desactivo la inflacion a proposito. No se le pide
          // que la configure: se le dice que no hay rendimiento real.
          <div className="rendimiento-real-yield-block">
            <span className="rendimiento-real-yield-label">
              {t('label_real_yield')}
            </span>
            <span className="rendimiento-real-yield rendimiento-real-yield--na">
              {t('msg_inflation_disabled')}
            </span>
          </div>
        ) : (
          // S12: sin datos de cotización no se pide configurar nada (ya está en
          // proxy dólar por defecto): se dice que todavía no hay dato.
          faltaConfigurar ? (
            <button
              type="button"
              className="rendimiento-real-cta"
              onClick={onConfigureInflation}
              disabled={!onConfigureInflation}
            >
              ⚙ {t('msg_configure_inflation')}
            </button>
          ) : (
            <div className="rendimiento-real-yield-block">
              <span className="rendimiento-real-yield-label">
                {t('label_real_yield')}
              </span>
              <span className="rendimiento-real-yield rendimiento-real-yield--na">
                {t('msg_inflation_no_data')}
              </span>
            </div>
          )
        )}
      </div>
    </header>
  )
}

export default RendimientoRealWidget
