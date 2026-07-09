import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import './RendimientoInflacionChart.css'

export interface RendimientoVsInflacion {
  sin_inversiones: boolean
  total_actual?: number
  total_original?: number
  rendimiento_nominal?: number
  inflacion_disponible?: boolean
  inflacion_6m?: number | null
  rendimiento_real?: number | null
  fuente_inflacion?: 'api_automatica' | 'proxy_dolar' | 'desactivado'
  mensaje_key: string
}

interface RendimientoInflacionChartProps {
  className?: string
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const fixed = value.toFixed(2)
  if (value > 0) return `+${fixed}%`
  return `${fixed}%`
}

function normalizeData(data: RendimientoVsInflacion): RendimientoVsInflacion {
  return {
    sin_inversiones: Boolean(data.sin_inversiones),
    total_actual: data.total_actual === undefined ? undefined : Number(data.total_actual),
    total_original: data.total_original === undefined ? undefined : Number(data.total_original),
    rendimiento_nominal: data.rendimiento_nominal === undefined ? undefined : Number(data.rendimiento_nominal),
    inflacion_disponible: Boolean(data.inflacion_disponible),
    inflacion_6m: data.inflacion_6m === null || data.inflacion_6m === undefined
      ? null
      : Number(data.inflacion_6m),
    rendimiento_real: data.rendimiento_real === null || data.rendimiento_real === undefined
      ? null
      : Number(data.rendimiento_real),
    fuente_inflacion: data.fuente_inflacion,
    mensaje_key: data.mensaje_key,
  }
}

function barHeight(value: number, maxAbs: number): string {
  if (maxAbs <= 0) return '8%'
  return `${Math.max(8, Math.min(100, (Math.abs(value) / maxAbs) * 100))}%`
}

function barClassFor(value: number): string {
  if (value > 0) return 'rendimiento-chart-bar rendimiento-chart-bar--positive'
  if (value < 0) return 'rendimiento-chart-bar rendimiento-chart-bar--negative'
  return 'rendimiento-chart-bar rendimiento-chart-bar--zero'
}

function sourceKeyFor(source: RendimientoVsInflacion['fuente_inflacion']): string {
  if (source === 'api_automatica') return 'inflation_source_api_automatica'
  if (source === 'proxy_dolar') return 'inflation_source_proxy_dolar'
  return 'inflation_source_desactivado'
}

export function RendimientoInflacionChart({ className }: RendimientoInflacionChartProps) {
  const { showToast } = useToast()
  const [data, setData] = useState<RendimientoVsInflacion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadRendimiento() {
      setLoading(true)
      try {
        const res = await rpc<RendimientoVsInflacion>('fn_reporte_rendimiento_vs_inflacion')
        if (!cancelled) {
          setData(normalizeData(res))
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

    loadRendimiento()

    return () => {
      cancelled = true
    }
  }, [showToast])

  const rootClass = className
    ? `rendimiento-chart ${className}`
    : 'rendimiento-chart'

  if (loading) {
    return (
      <section className={`${rootClass} rendimiento-chart--loading`} aria-busy="true">
        <div className="rendimiento-chart-skeleton" aria-hidden="true" />
      </section>
    )
  }

  if (!data || data.sin_inversiones) {
    return (
      <section className={`${rootClass} rendimiento-chart--empty`}>
        <h3 className="rendimiento-chart-empty-title">{t('label_real_yield')}</h3>
        <p className="rendimiento-chart-empty-text">{t('msg_no_investments')}</p>
      </section>
    )
  }

  if (data.inflacion_disponible === false) {
    return (
      <section className={`${rootClass} rendimiento-chart--empty`}>
        <h3 className="rendimiento-chart-empty-title">{t('label_real_yield')}</h3>
        <p className="rendimiento-chart-cta-note">{t('msg_configure_inflation')}</p>
      </section>
    )
  }

  const nominal = data.rendimiento_nominal ?? 0
  const real = data.rendimiento_real ?? 0
  const maxAbs = Math.max(Math.abs(nominal), Math.abs(real), 1)
  const verdictIsPositive = real > 0
  const verdictKey = verdictIsPositive ? 'msg_beat_inflation' : 'msg_lost_purchasing_power'

  return (
    <section className={rootClass} aria-label={t('label_real_yield')}>
      <header className="rendimiento-chart-header">
        <div>
          <h3 className="rendimiento-chart-title">{t('label_real_yield')}</h3>
          {data.fuente_inflacion && (
            <p className="rendimiento-chart-source">{t(sourceKeyFor(data.fuente_inflacion))}</p>
          )}
        </div>
        <span
          className={
            verdictIsPositive
              ? 'rendimiento-chart-verdict rendimiento-chart-verdict--positive'
              : 'rendimiento-chart-verdict rendimiento-chart-verdict--negative'
          }
        >
          {t(verdictKey)}
        </span>
      </header>

      <div className="rendimiento-chart-bars" role="img" aria-label={t('label_real_yield')}>
        <div className="rendimiento-chart-axis" aria-hidden="true" />
        <article className="rendimiento-chart-bar-card">
          <div className="rendimiento-chart-bar-track">
            <div
              className={barClassFor(nominal)}
              style={{ height: barHeight(nominal, maxAbs) }}
              aria-hidden="true"
            />
          </div>
          <span className="rendimiento-chart-bar-value">{formatPercent(nominal)}</span>
          <span className="rendimiento-chart-bar-label">{t('label_nominal_yield')}</span>
        </article>

        <article className="rendimiento-chart-bar-card">
          <div className="rendimiento-chart-bar-track">
            <div
              className={barClassFor(real)}
              style={{ height: barHeight(real, maxAbs) }}
              aria-hidden="true"
            />
          </div>
          <span className="rendimiento-chart-bar-value">{formatPercent(real)}</span>
          <span className="rendimiento-chart-bar-label">{t('label_real_yield')}</span>
        </article>
      </div>

      {data.inflacion_6m !== null && data.inflacion_6m !== undefined && (
        <footer className="rendimiento-chart-footer">
          <span className="rendimiento-chart-footer-label">{t('label_inflation_6m')}</span>
          <span className="rendimiento-chart-footer-value">{formatPercent(data.inflacion_6m)}</span>
        </footer>
      )}
    </section>
  )
}

export default RendimientoInflacionChart
