import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import './DetalleInversionView.css'

export interface HistorialItem {
  fecha: string | null
  detalle: string | null
  monto: number | null
}

export interface DetalleInversion {
  inversion_id: number
  nombre_activo: string | null
  tipo_activo: 'plazo_fijo' | 'variable' | string
  monto_invertido_original: number | null
  valor_actual_teorico: number | null
  valor_mercado_actual: number | null
  tasa_anual_tna: number | null
  moneda: string | null
  ultima_conciliacion: string | null
  dias_desde_conciliacion: number | null
  estado_semaforo_key: 'green' | 'yellow' | 'red' | string
  estado_inversion: string | null
  rendimiento_nominal: number | null
  rendimiento_real: number | null
  historial: HistorialItem[] | null
}

interface DetalleInversionViewProps {
  inversionId: number
  onBack: () => void
  onUpdateValue: (id: number) => void
  onLiquidate: (id: number) => void
}

function badgeClassFor(tipo: string): string {
  if (tipo === 'plazo_fijo') return 'detalle-badge detalle-badge--pf'
  if (tipo === 'variable') return 'detalle-badge detalle-badge--var'
  return 'detalle-badge detalle-badge--other'
}

function typeTranslationKey(tipo: string): string {
  if (tipo === 'plazo_fijo' || tipo === 'variable') return `type_${tipo}`
  return 'type_otro'
}

function semaforoLabelKey(key: string): string {
  if (key === 'green') return 'badge_semaforo_green'
  if (key === 'yellow') return 'badge_semaforo_yellow'
  if (key === 'red') return 'badge_semaforo_red'
  return 'badge_semaforo_green'
}

function yieldClassFor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'detalle-yield detalle-yield--na'
  }
  if (value > 0) return 'detalle-yield detalle-yield--positive'
  if (value < 0) return 'detalle-yield detalle-yield--negative'
  return 'detalle-yield detalle-yield--zero'
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const fixed = value.toFixed(2)
  if (value > 0) return `+${fixed}%`
  if (value < 0) return `${fixed}%`
  return `${fixed}%`
}

function movementClassFor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'detalle-history-amount detalle-history-amount--zero'
  }
  if (value > 0) return 'detalle-history-amount detalle-history-amount--positive'
  if (value < 0) return 'detalle-history-amount detalle-history-amount--negative'
  return 'detalle-history-amount detalle-history-amount--zero'
}

export function DetalleInversionView({
  inversionId,
  onBack,
  onUpdateValue,
  onLiquidate,
}: DetalleInversionViewProps) {
  const { showToast } = useToast()
  const [data, setData] = useState<DetalleInversion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDetalle() {
      setLoading(true)
      try {
        const res = await rpc<DetalleInversion>('fn_reporte_detalle_inversion', {
          p_inversion_id: inversionId,
        })
        if (!cancelled) {
          setData(res)
        }
      } catch (err) {
        if (!cancelled) {
          const message = parseError(err) || t('error_generic')
          showToast(message, 'error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDetalle()

    return () => {
      cancelled = true
    }
  }, [inversionId, showToast])

  if (loading) {
    return (
      <div className="detalle-view detalle-view--loading" aria-busy="true">
        <div className="detalle-spinner" aria-hidden="true" />
        <p className="detalle-loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="detalle-view detalle-view--error">
        <p className="detalle-error-text">{t('error_generic')}</p>
        <button type="button" className="detalle-back-btn" onClick={onBack}>
          {t('detail_back')}
        </button>
      </div>
    )
  }

  const nombre = data.nombre_activo || t('msg_no_investments')
  const typeKey = typeTranslationKey(data.tipo_activo)
  const typeLabel = t(typeKey)
  const badgeClass = badgeClassFor(data.tipo_activo)
  const semaforoLabel = t(semaforoLabelKey(data.estado_semaforo_key))
  const moneda = data.moneda || 'ARS'
  const historial = data.historial || []

  return (
    <div className="detalle-view">
      <header className="detalle-header">
        <button
          type="button"
          className="detalle-back-btn detalle-back-btn--icon"
          onClick={onBack}
          aria-label={t('detail_back')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="detalle-header-text">
          <h2 className="detalle-title">{nombre}</h2>
          <span className={badgeClass}>{typeLabel}</span>
        </div>
      </header>

      <div className="detalle-meta">
        <span
          className="detalle-semaforo-dot"
          aria-hidden="true"
          data-semaforo={data.estado_semaforo_key}
        />
        <span className="detalle-semaforo-label">{semaforoLabel}</span>
        {data.dias_desde_conciliacion !== null && (
          <span className="detalle-semaforo-days">
            {data.dias_desde_conciliacion} {t('days_since_conciliation')}
          </span>
        )}
      </div>

      <section className="detalle-metrics" aria-label={t('label_current_value')}>
        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_capital')}</span>
          <span className="detalle-metric-value">
            {formatCurrency(data.monto_invertido_original, moneda)}
          </span>
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_current_value')}</span>
          <span className="detalle-metric-value">
            {formatCurrency(data.valor_actual_teorico, moneda)}
          </span>
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_nominal_yield')}</span>
          <span className={yieldClassFor(data.rendimiento_nominal)}>
            {formatPercent(data.rendimiento_nominal)}
          </span>
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_real_yield')}</span>
          {data.rendimiento_real === null ? (
            <span className="detalle-yield detalle-yield--na detalle-metric-helper">
              {t('msg_configure_inflation')}
            </span>
          ) : (
            <span className={yieldClassFor(data.rendimiento_real)}>
              {formatPercent(data.rendimiento_real)}
            </span>
          )}
        </article>
      </section>

      <section className="detalle-extras">
        <div className="detalle-extra-row">
          <span className="detalle-extra-label">{t('label_last_conciliation')}</span>
          <span className="detalle-extra-value">{formatDate(data.ultima_conciliacion)}</span>
        </div>
        {data.tasa_anual_tna !== null && data.tasa_anual_tna > 0 && (
          <div className="detalle-extra-row">
            <span className="detalle-extra-label">{t('label_tna')}</span>
            <span className="detalle-extra-value">
              {data.tasa_anual_tna.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="detalle-extra-row">
          <span className="detalle-extra-label">{t('label_currency')}</span>
          <span className="detalle-extra-value">{moneda}</span>
        </div>
      </section>

      <section className="detalle-history">
        <h3 className="detalle-history-title">{t('detail_history_title')}</h3>
        {historial.length === 0 ? (
          <p className="detalle-history-empty">{t('detail_history_empty')}</p>
        ) : (
          <ul className="detalle-history-list">
            {historial.map((mov, idx) => (
              <li key={`${mov.fecha ?? 'mov'}-${idx}`} className="detalle-history-item">
                <div className="detalle-history-meta">
                  <span className="detalle-history-date">
                    {formatDate(mov.fecha)}
                  </span>
                  <span className="detalle-history-detalle">
                    {mov.detalle || t('detail_movement_label')}
                  </span>
                </div>
                <span
                  className={movementClassFor(mov.monto)}
                  aria-label={t('detail_movement_monto_label')}
                >
                  {formatCurrency(mov.monto, moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="detalle-actions">
        <button
          type="button"
          className="detalle-action-btn detalle-action-btn--update"
          onClick={() => onUpdateValue(data.inversion_id)}
        >
          <span aria-hidden="true">📊</span>
          <span>{t('btn_update_value')}</span>
        </button>
        <button
          type="button"
          className="detalle-action-btn detalle-action-btn--liquidate"
          onClick={() => onLiquidate(data.inversion_id)}
        >
          <span aria-hidden="true">💸</span>
          <span>{t('btn_liquidate')}</span>
        </button>
      </footer>
    </div>
  )
}

export default DetalleInversionView
