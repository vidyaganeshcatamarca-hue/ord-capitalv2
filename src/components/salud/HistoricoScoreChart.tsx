import { useState } from 'react'
import { haptics } from '@/lib/haptics'
import { formatDate } from '@/lib/format'
import { t } from '@/locales/i18n'
import './HistoricoScoreChart.css'

export interface HealthHistoryPoint {
  fecha: string
  score_global: number
  estado_key: string
}

interface HistoricoScoreChartProps {
  points: HealthHistoryPoint[]
  error?: boolean
  onRetry?: () => void
}

const WIDTH = 360
const HEIGHT = 190
const PAD_X = 28
const PAD_Y = 22

function xFor(index: number, total: number) {
  if (total <= 1) return WIDTH / 2
  return PAD_X + (index / (total - 1)) * (WIDTH - PAD_X * 2)
}

function yFor(score: number) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0))
  return HEIGHT - PAD_Y - (clamped / 100) * (HEIGHT - PAD_Y * 2)
}

function pathFor(points: HealthHistoryPoint[]) {
  return points.map((point, index) => {
    const command = index === 0 ? 'M' : 'L'
    return `${command} ${xFor(index, points.length)} ${yFor(point.score_global)}`
  }).join(' ')
}

export function HistoricoScoreChart({ points, error = false, onRetry }: HistoricoScoreChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  if (error) {
    return (
      <section className="health-history" aria-labelledby="health-history-title">
        <header className="health-section-header">
          <h2 id="health-history-title">{t('health_history_title')}</h2>
        </header>
        <div className="health-history-empty">
          <p>{t('health_history_error')}</p>
          {onRetry && (
            <button type="button" className="health-history-retry" onClick={onRetry}>
              {t('health_retry')}
            </button>
          )}
        </div>
      </section>
    )
  }

  if (points.length === 0) {
    return (
      <section className="health-history" aria-labelledby="health-history-title">
        <header className="health-section-header">
          <h2 id="health-history-title">{t('health_history_title')}</h2>
        </header>
        <div className="health-history-empty">
          <p>{t('health_history_empty')}</p>
        </div>
      </section>
    )
  }

  const selected = selectedIndex === null ? null : points[selectedIndex]
  const linePath = pathFor(points)
  const areaPath = `${linePath} L ${xFor(points.length - 1, points.length)} ${HEIGHT - PAD_Y} L ${xFor(0, points.length)} ${HEIGHT - PAD_Y} Z`

  return (
    <section className="health-history" aria-labelledby="health-history-title">
      <header className="health-section-header">
        <h2 id="health-history-title">{t('health_history_title')}</h2>
      </header>

      <div className="health-history-chart" role="img" aria-label={t('health_history_title')}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="health-history-svg" aria-hidden="true">
          {[60, 80].map((ref) => (
            <g key={ref}>
              <line className="health-history-ref" x1={PAD_X} x2={WIDTH - PAD_X} y1={yFor(ref)} y2={yFor(ref)} />
              <text className="health-history-ref-label" x={WIDTH - PAD_X} y={yFor(ref) - 4} textAnchor="end">
                {ref === 60 ? t('health_reference_healthy') : t('health_reference_excellent')}
              </text>
            </g>
          ))}
          <path className="health-history-area" d={areaPath} />
          <path className="health-history-line" d={linePath} />
          {points.map((point, index) => (
            <circle
              key={`${point.fecha}-${index}`}
              className="health-history-dot"
              cx={xFor(index, points.length)}
              cy={yFor(point.score_global)}
              r={selectedIndex === index ? 5 : 3.5}
              onClick={() => {
                setSelectedIndex(index)
                haptics.light()
              }}
            />
          ))}
        </svg>
      </div>

      {selected && (
        <p className="health-history-tooltip">
          {formatDate(selected.fecha)} - {t('health_score_out_of', { score: selected.score_global })} - {t(selected.estado_key)}
        </p>
      )}
    </section>
  )
}

export default HistoricoScoreChart
