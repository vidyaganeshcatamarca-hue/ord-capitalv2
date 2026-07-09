import { t } from '@/locales/i18n'
import './ScoreRadar.css'

export type HealthPillarKey = 'proteccion' | 'presupuesto' | 'deuda' | 'crecimiento' | 'ahorro'

export type HealthDimensions = Record<HealthPillarKey, number>

interface ScoreRadarProps {
  dimensiones: HealthDimensions
}

const AXES: Array<{ key: HealthPillarKey; angle: number }> = [
  { key: 'proteccion', angle: -90 },
  { key: 'presupuesto', angle: -18 },
  { key: 'deuda', angle: 54 },
  { key: 'crecimiento', angle: 126 },
  { key: 'ahorro', angle: 198 },
]

const CENTER = 100
const RADIUS = 68

function pointFor(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius,
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function labelKeyFor(key: HealthPillarKey) {
  return `health_pillar_${key}`
}

export function ScoreRadar({ dimensiones }: ScoreRadarProps) {
  const polygonPoints = AXES.map(({ key, angle }) => {
    const point = pointFor(angle, (clampScore(dimensiones[key]) / 100) * RADIUS)
    return `${point.x},${point.y}`
  }).join(' ')

  const gridLevels = [0.25, 0.5, 0.75, 1]

  return (
    <div className="score-radar" role="img" aria-label={t('health_score_detail')}>
      <svg viewBox="0 0 200 200" className="score-radar-svg" aria-hidden="true">
        {gridLevels.map((level) => (
          <polygon
            key={level}
            className="score-radar-grid"
            points={AXES.map(({ angle }) => {
              const point = pointFor(angle, RADIUS * level)
              return `${point.x},${point.y}`
            }).join(' ')}
          />
        ))}

        {AXES.map(({ angle, key }) => {
          const end = pointFor(angle, RADIUS)
          const label = pointFor(angle, RADIUS + 19)
          return (
            <g key={key}>
              <line className="score-radar-axis" x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} />
              <text className="score-radar-label" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
                {t(labelKeyFor(key))}
              </text>
            </g>
          )
        })}

        <polygon className="score-radar-area" points={polygonPoints} />
        <polygon className="score-radar-line" points={polygonPoints} />
        {AXES.map(({ key, angle }) => {
          const point = pointFor(angle, (clampScore(dimensiones[key]) / 100) * RADIUS)
          return <circle key={key} className="score-radar-dot" cx={point.x} cy={point.y} r="3.5" />
        })}
      </svg>
    </div>
  )
}

export default ScoreRadar
