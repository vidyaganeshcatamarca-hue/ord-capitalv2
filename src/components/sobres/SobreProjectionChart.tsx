import { t } from '@/locales/i18n'
import './SobreProjectionChart.css'

interface SobreProjectionChartProps {
  progreso: number
}

const WIDTH = 320
const HEIGHT = 160
const PAD = 22

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

export function SobreProjectionChart({ progreso }: SobreProjectionChartProps) {
  const pct = clamp(progreso)
  const x = PAD + (pct / 100) * (WIDTH - PAD * 2)
  const y = HEIGHT - PAD - (pct / 100) * (HEIGHT - PAD * 2)

  return (
    <div className="sobre-projection" aria-label={t('sobres_projection_title')}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="sobre-projection-svg" aria-hidden="true">
        <line className="sobre-projection-axis" x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} />
        <line className="sobre-projection-axis" x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} />
        <line className="sobre-projection-ideal" x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={PAD} />
        <path className="sobre-projection-real" d={`M ${PAD} ${HEIGHT - PAD} L ${x} ${y}`} />
        <circle className="sobre-projection-dot" cx={x} cy={y} r="5" />
      </svg>
    </div>
  )
}

export default SobreProjectionChart
