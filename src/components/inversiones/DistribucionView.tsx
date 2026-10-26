import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatPercent, getFormatContext } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import { DistribucionDonut, type DistribucionActivoRow } from './DistribucionDonut'
import { clasificarDistribucion, mostrarEquivalenteLocal } from '@/lib/distribucionInversiones'
import './DistribucionView.css'
import { useFormatRevision } from '@/hooks/useFormatRevision'

interface DistribucionViewProps {
  className?: string
}

function normalizeRow(row: DistribucionActivoRow): DistribucionActivoRow {
  const id = row.inversion_id
  return {
    tipo_activo: row.tipo_activo,
    cantidad: Number(row.cantidad),
    valor_total: Number(row.valor_total),
    porcentaje_valor: Number(row.porcentaje_valor),
    // S6: con la migración 91 llegan estos dos; sin ella vienen ausentes y la
    // vista cae al agrupado por tipo de siempre.
    inversion_id: id === null || id === undefined ? null : Number(id),
    nombre_activo:
      typeof row.nombre_activo === 'string' && row.nombre_activo.trim()
        ? row.nombre_activo.trim()
        : null,
    // S6b: valor en la moneda propia + la moneda. Sin esto la tabla cae al
    // equivalente en moneda local (backend sin migrar).
    valor_propio:
      row.valor_propio === null || row.valor_propio === undefined
        ? null
        : Number(row.valor_propio),
    moneda:
      typeof row.moneda === 'string' && row.moneda.trim()
        ? row.moneda.trim().toUpperCase()
        : null,
  }
}

function typeTranslationKey(tipo: string): string {
  if (tipo === 'plazo_fijo' || tipo === 'variable') return `type_${tipo}`
  return 'type_otro'
}

function colorClassFor(item: DistribucionActivoRow, index: number): string {
  // Con nombre hay una porción por inversión: el color sale de la serie, no del
  // tipo, para que dos inversiones del mismo tipo no salgan iguales.
  if (item.nombre_activo) {
    const variantes = ['pf', 'var', 'alt1', 'alt2', 'alt3', 'alt4']
    return `distribucion-type-dot distribucion-type-dot--${variantes[index % variantes.length]}`
  }
  if (item.tipo_activo === 'plazo_fijo') return 'distribucion-type-dot distribucion-type-dot--pf'
  if (item.tipo_activo === 'variable') return 'distribucion-type-dot distribucion-type-dot--var'
  return 'distribucion-type-dot distribucion-type-dot--other'
}

export function DistribucionView({ className }: DistribucionViewProps) {
  // Formato por moneda: se re-renderiza cuando cambia el contexto.
  useFormatRevision()
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

  // S6 (2026-10-24): una porción por inversión cuando el backend ya devuelve el
  // nombre; si no (SQL sin publicar), agrupado por tipo como antes.
  const { modo, filas } = clasificarDistribucion(items)
  const porInversion = modo === 'inversion'
  // Verificado en el navegador: con el SQL 91 sin aplicar, el título decía "por
  // inversión" y la tabla "tipo de activo". El subtítulo sigue al modo, porque
  // describir una cosa y mostrar otra es peor que el agrupado en sí.
  const subtitulo = porInversion
    ? t('distribution_subtitle')
    : t('distribution_subtitle_tipo')

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

  if (filas.length === 0) {
    return (
      <section className={`${rootClass} distribucion-view--empty`}>
        <DistribucionDonut data={[]} size={180} />
        <h3 className="distribucion-empty-title">{t('tab_distribucion')}</h3>
        <p className="distribucion-empty-text">{t('msg_no_investments')}</p>
      </section>
    )
  }

  return (
    <section className={rootClass} aria-label={subtitulo}>
      <header className="distribucion-header">
        <h2 className="distribucion-title">{t('tab_distribucion')}</h2>
        <p className="distribucion-subtitle">{subtitulo}</p>
      </header>

      <div className="distribucion-card">
        <div className="distribucion-chart-panel">
          <DistribucionDonut data={filas} />
        </div>

        <div className="distribucion-table-wrap">
          <table className="distribucion-table">
            <thead>
              <tr>
                <th scope="col">
                  {porInversion ? t('distribution_investment') : t('label_type')}
                </th>
                <th scope="col">{t('distribution_total_value')}</th>
                <th scope="col">{t('distribution_percentage')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((item, idx) => (
                <tr key={String(item.inversion_id ?? item.nombre_activo ?? item.tipo_activo) + idx}>
                  <td>
                    {/* S13: la cantidad pasó al lado del tipo. Como columna
                        propia se comía el ancho que necesita el valor y hacía
                        que "$ 350.000" se cortara en el teléfono. */}
                    <span className="distribucion-type-cell">
                      <span className={colorClassFor(item, idx)} aria-hidden="true" />
                      {porInversion
                        ? item.nombre_activo
                        : t(typeTranslationKey(item.tipo_activo))}
                      {' '}
                      {!porInversion && (
                        <span className="distribucion-type-count">({item.cantidad})</span>
                      )}
                    </span>
                  </td>
                  <td>
                    {/* S6b (2026-10-24, dueño): "muestras los valores en moneda de
                        la inversión y entre paréntesis el valor en moneda local".
                        La conversión es una vara común para el % del donut; el
                        valor propio es el que se lee primero. Si el backend
                        todavía no manda valor_propio, queda solo la local. */}
                    {item.valor_propio !== null &&
                    item.valor_propio !== undefined &&
                    item.moneda ? (
                      <>
                        {formatCurrency(item.valor_propio, item.moneda)}
                        {/* S4 (ronda 5, dueño): el paréntesis con la conversión sólo
                            tiene sentido cuando la inversión está en OTRA moneda. Si ya
                            está en la local, el número de la izquierda es ese mismo. */}
                        {mostrarEquivalenteLocal(item.moneda, getFormatContext().localCurrency) && (
                          <span className="distribucion-value-local">
                            {' '}
                            ({formatCurrency(item.valor_total)})
                          </span>
                        )}
                      </>
                    ) : (
                      formatCurrency(item.valor_total)
                    )}
                  </td>
                  <td>{formatPercent(item.porcentaje_valor, { signed: false })}</td>
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
