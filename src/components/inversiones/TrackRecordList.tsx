import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import './TrackRecordList.css'

export interface HistorialInversionRow {
  inversion_id: number
  nombre_activo: string
  moneda?: string
  monto_original: number
  monto_liquidado: number
  ganancia_perdida: number
  rendimiento_pct: number
  fecha_inicio: string
  fecha_liquidacion: string
  dias_mantenida: number
}

interface TrackRecordListProps {
  className?: string
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const fixed = value.toFixed(2)
  if (value > 0) return `+${fixed}%`
  return `${fixed}%`
}

function gainClassFor(value: number): string {
  if (value > 0) return 'track-record-list-gain track-record-list-gain--positive'
  if (value < 0) return 'track-record-list-gain track-record-list-gain--negative'
  return 'track-record-list-gain track-record-list-gain--zero'
}

function normalizeRow(row: HistorialInversionRow): HistorialInversionRow {
  return {
    inversion_id: Number(row.inversion_id),
    nombre_activo: row.nombre_activo,
    moneda: row.moneda,
    monto_original: Number(row.monto_original),
    monto_liquidado: Number(row.monto_liquidado),
    ganancia_perdida: Number(row.ganancia_perdida),
    rendimiento_pct: Number(row.rendimiento_pct),
    fecha_inicio: row.fecha_inicio,
    fecha_liquidacion: row.fecha_liquidacion,
    dias_mantenida: Number(row.dias_mantenida),
  }
}

export function TrackRecordList({ className }: TrackRecordListProps) {
  const { showToast } = useToast()
  const [items, setItems] = useState<HistorialInversionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadTrackRecord() {
      setLoading(true)
      try {
        const data = await rpc<HistorialInversionRow[]>('fn_reporte_historial_inversiones')
        if (!cancelled) {
          setItems((data || []).map(normalizeRow))
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

    loadTrackRecord()

    return () => {
      cancelled = true
    }
  }, [showToast])

  const rootClass = className
    ? `track-record-list ${className}`
    : 'track-record-list'

  if (loading) {
    return (
      <section className={`${rootClass} track-record-list--loading`} aria-busy="true">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="track-record-list-skeleton" aria-hidden="true" />
        ))}
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className={`${rootClass} track-record-list--empty`}>
        <h3 className="track-record-list-empty-title">{t('track_record_subtitle')}</h3>
        <p className="track-record-list-empty-text">{t('msg_no_investments')}</p>
      </section>
    )
  }

  return (
    <section className={rootClass} aria-label={t('track_record_subtitle')}>
      <ul className="track-record-list-items">
        {items.map((item) => {
          const gain = item.ganancia_perdida
          const gainPrefix = gain > 0 ? '+' : ''
          const currency = item.moneda ?? 'ARS'

          return (
            <li key={item.inversion_id} className="track-record-list-item">
              <div className="track-record-list-main">
                <h3 className="track-record-list-title">{item.nombre_activo}</h3>
                <div className="track-record-list-amounts">
                  <span>{formatCurrency(item.monto_original, currency)}</span>
                  <span className="track-record-list-arrow" aria-hidden="true">→</span>
                  <span>{formatCurrency(item.monto_liquidado, currency)}</span>
                </div>
              </div>

              <div className="track-record-list-metrics">
                <div className="track-record-list-metric">
                  <span className="track-record-list-label">{t('label_gain')}</span>
                  <span className={gainClassFor(gain)}>
                    {gainPrefix}{formatCurrency(gain, currency)}
                  </span>
                </div>
                <div className="track-record-list-metric">
                  <span className="track-record-list-label">{t('label_nominal_yield')}</span>
                  <span className={gainClassFor(item.rendimiento_pct)}>
                    {formatPercent(item.rendimiento_pct)}
                  </span>
                </div>
                <div className="track-record-list-metric">
                  <span className="track-record-list-label">{t('holding_days')}</span>
                  <span className="track-record-list-value">{item.dias_mantenida}</span>
                </div>
              </div>

              <div className="track-record-list-dates">
                <span>{formatDate(item.fecha_inicio)}</span>
                <span>{formatDate(item.fecha_liquidacion)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default TrackRecordList
