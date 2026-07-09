import { useMemo } from 'react'
import { t } from '@/locales/i18n'
import { BCG_FRECUENCIA_ALTA, BCG_PLACER_ALTO, BCG_CUADRANTES, classifyCuadrante, dominioX, radiusFromMonto } from '@/lib/bcgUtils'
import { haptics } from '@/lib/haptics'
import './BCGScatterPlot.css'

export interface BCGPoint {
  estructura_id: number
  nombre: string
  rubro_padre: string | null
  coordenada_x: number   // frecuencia (COUNT)
  coordenada_y: number   // placer (1-10)
  cuadrante_key: string
  icono: string
  color: string
  monto_total: number    // para el radio
}

interface BCGScatterPlotProps {
  points: BCGPoint[]
  onPointClick?: (point: BCGPoint) => void
  emptyMessage?: string
}

const VIEW_W = 360
const VIEW_H = 280
const PADDING_L = 36
const PADDING_R = 12
const PADDING_T = 16
const PADDING_B = 28

export function BCGScatterPlot({ points, onPointClick, emptyMessage }: BCGScatterPlotProps) {
  const { maxX, maxMonto } = useMemo(() => {
    const mX = points.reduce((m, p) => Math.max(m, p.coordenada_x ?? 0), 0)
    const mM = points.reduce((m, p) => Math.max(m, p.monto_total ?? 0), 0)
    return { maxX: dominioX(mX), maxMonto: mM }
  }, [points])

  if (points.length === 0) {
    return (
      <div className="bcg-scatter-empty">
        <span className="bcg-scatter-empty-icon">📊</span>
        <p>{emptyMessage ?? t('bcg_empty_sin_gastos')}</p>
      </div>
    )
  }

  const plotW = VIEW_W - PADDING_L - PADDING_R
  const plotH = VIEW_H - PADDING_T - PADDING_B

  const xFor = (frec: number) => PADDING_L + (Math.min(frec, maxX) / maxX) * plotW
  const yFor = (placer: number) => PADDING_T + plotH - (Math.min(Math.max(placer, 0), 10) / 10) * plotH

  const xCorte = xFor(BCG_FRECUENCIA_ALTA)
  const yCorte = yFor(BCG_PLACER_ALTO)

  return (
    <div className="bcg-scatter">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="bcg-scatter-svg" role="img" aria-label={t('bcg_matriz_titulo')}>
        {/* Cuadrantes de fondo (colores sutiles) */}
        <rect x={PADDING_L} y={PADDING_T} width={xCorte - PADDING_L} height={yCorte - PADDING_T} className="bcg-quad bcg-quad-cow" />
        <rect x={xCorte} y={PADDING_T} width={PADDING_L + plotW - xCorte} height={yCorte - PADDING_T} className="bcg-quad bcg-quad-star" />
        <rect x={PADDING_L} y={yCorte} width={xCorte - PADDING_L} height={PADDING_T + plotH - yCorte} className="bcg-quad bcg-quad-dilemma" />
        <rect x={xCorte} y={yCorte} width={PADDING_L + plotW - xCorte} height={PADDING_T + plotH - yCorte} className="bcg-quad bcg-quad-dog" />

        {/* Líneas de corte */}
        <line x1={xCorte} y1={PADDING_T} x2={xCorte} y2={PADDING_T + plotH} className="bcg-cut-line" />
        <line x1={PADDING_L} y1={yCorte} x2={PADDING_L + plotW} y2={yCorte} className="bcg-cut-line" />

        {/* Ejes labels */}
        <text x={PADDING_L} y={VIEW_H - 8} className="bcg-axis-label">{t('bcg_eje_x_label')}</text>
        <text x={6} y={PADDING_T + 6} className="bcg-axis-label" transform={`rotate(-90 6 ${PADDING_T + 6})`}>{t('bcg_eje_y_label')}</text>

        {/* Labels de cuadrante */}
        <text x={PADDING_L + 6} y={PADDING_T + 14} className="bcg-quad-label">{BCG_CUADRANTES.bcg_cow.emoji} {t('bcg_cuadrante_cow')}</text>
        <text x={PADDING_L + plotW - 6} y={PADDING_T + 14} className="bcg-quad-label" textAnchor="end">{BCG_CUADRANTES.bcg_star.emoji} {t('bcg_cuadrante_star')}</text>
        <text x={PADDING_L + 6} y={VIEW_H - PADDING_B - 6} className="bcg-quad-label">{BCG_CUADRANTES.bcg_dilemma.emoji} {t('bcg_cuadrante_dilemma')}</text>
        <text x={PADDING_L + plotW - 6} y={VIEW_H - PADDING_B - 6} className="bcg-quad-label" textAnchor="end">{BCG_CUADRANTES.bcg_dog.emoji} {t('bcg_cuadrante_dog')}</text>

        {/* Puntos */}
        {points.map((p) => {
          const cx = xFor(p.coordenada_x)
          const cy = yFor(p.coordenada_y)
          const r = radiusFromMonto(p.monto_total, maxMonto)
          const c = classifyCuadrante(p.cuadrante_key)
          const fill = c?.color ?? p.color ?? '#6366F1'
          return (
            <g
              key={p.estructura_id}
              className="bcg-point"
              onClick={() => {
                haptics.light()
                onPointClick?.(p)
              }}
              tabIndex={0}
              role="button"
              aria-label={`${p.icono} ${p.nombre} - ${t('btn_view_detail')}`}
            >
              <circle cx={cx} cy={cy} r={r} fill={fill} className="bcg-point-circle" />
              <text x={cx} y={cy + 3} className="bcg-point-icon" textAnchor="middle">{p.icono}</text>
              <title>{`${p.icono} ${p.nombre} · Placer ${p.coordenada_y}/10 · Frec ${p.coordenada_x}/mes`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default BCGScatterPlot
