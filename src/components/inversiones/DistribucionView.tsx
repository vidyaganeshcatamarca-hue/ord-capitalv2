import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import { DistribucionDonut, type DistribucionActivoRow } from './DistribucionDonut'
import './DistribucionView.css'

interface DistribucionViewProps {
  className?: string
}

function normalizeRow(row: DistribucionActivoRow): DistribucionActivoRow {
  return {
    tipo_activo: row.tipo_activo,
    cantidad: Number(row.cantidad),
    valor_total: Number(row.valor_total),
    porcentaje_valor: Number(row.porcentaje_valor),
  }
}

function typeTranslationKey(tipo: string): string {
  if (tipo === 'plazo_fijo' || tipo === 'variable') return `type_${tipo}`
  return 'type_otro'
}

function colorClassFor(tipo: string): string {
  if (tipo === 'plazo_fijo') return 'distribucion-type-dot distribucion-type-dot--pf'
  if (tipo === 'variable') return 'distribucion-type-dot distribucion-type-dot--var'
  return 'distribucion-type-dot distribucion-type-dot--other'
}

function formatPercent(value: number): string {
  if (Number.isNaN(value)) return '-'
  return `${value.toFixed(2)}%`
}

export function DistribucionView({ className }: DistribucionViewProps) {
  const { showToast } = useToast()
  const [items, setItems] = useState<DistribucionActivoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDistribucion() {
      setLoading(true)
      try {
        const data = await rpc<DistribucionActivoRow[]>('fn_reporte_distribucion_activos')
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

    loadDistribucion()

    return () => {
      cancelled = true
    }
  }, [showToast])

  const rootClass = className
    ? `distribucion-view ${className}`
    : 'distribucion-view'

  if (loading) {
    return (
      <section className={`${rootClass} distribucion-view--loading`} aria-busy="true">
        <div className="distribucion-skeleton distribucion-skeleton--donut" aria-hidden="true" />
        <div className="distribucion-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="distribucion-skeleton distribucion-skeleton--row" />
          ))}
        </div>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className={`${rootClass} distribucion-view--empty`}>
        <DistribucionDonut data={[]} size={180} />
        <h3 className="distribucion-empty-title">{t('tab_distribucion')}</h3>
        <p className="distribucion-empty-text">{t('msg_no_investments')}</p>
      </section>
    )
  }

  return (
    <section className={rootClass} aria-label={t('distribution_subtitle')}>
      <header className="distribucion-header">
        <h2 className="distribucion-title">{t('tab_distribucion')}</h2>
        <p className="distribucion-subtitle">{t('distribution_subtitle')}</p>
      </header>

      <div className="distribucion-card">
        <div className="distribucion-chart-panel">
          <DistribucionDonut data={items} />
        </div>

        <div className="distribucion-table-wrap">
          <table className="distribucion-table">
            <thead>
              <tr>
                <th scope="col">{t('label_type')}</th>
                <th scope="col">{t('distribution_quantity')}</th>
                <th scope="col">{t('distribution_total_value')}</th>
                <th scope="col">{t('distribution_percentage')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.tipo_activo}>
                  <td>
                    <span className="distribucion-type-cell">
                      <span className={colorClassFor(item.tipo_activo)} aria-hidden="true" />
                      {t(typeTranslationKey(item.tipo_activo))}
                    </span>
                  </td>
                  <td>{item.cantidad}</td>
                  <td>{formatCurrency(item.valor_total, 'ARS')}</td>
                  <td>{formatPercent(item.porcentaje_valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default DistribucionView
