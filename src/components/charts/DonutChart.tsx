import { t } from '@/locales/i18n'
import './DonutChart.css'

interface DonutChartProps {
  data: any[]
  hideAmounts: boolean
  total?: number
  centerLabelKey?: string
  totalField?: string
}

export function DonutChart({ data, hideAmounts, total: totalOverride, centerLabelKey = 'donut_total_expense', totalField = 'total_consumido' }: DonutChartProps) {
  const radius = 38
  const strokeWidth = 10
  const circumference = 2 * Math.PI * radius

  const total = typeof totalOverride === 'number'
    ? totalOverride
    : data.reduce((sum, item) => sum + (Number(item[totalField]) || 0), 0)
  if (total === 0) return null

  return (
    <div className="donut-chart-container">
      <svg viewBox="0 0 100 100" className="donut-chart-svg">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="var(--surface)"
          strokeWidth={strokeWidth}
        />
        {(() => {
          let accumulatedPercent = 0
          const activeSegments = data.filter(item => (Number(item.porcentaje_del_total) || 0) > 0)
          const gap = activeSegments.length > 1 ? 2.5 : 0

          return data.map((item, idx) => {
            const percentage = Number(item.porcentaje_del_total) || 0
            if (percentage <= 0) return null
            const strokeLength = Math.max(0, (percentage / 100) * circumference - gap)
            const strokeOffset = -(accumulatedPercent / 100) * circumference
            accumulatedPercent += percentage

            return (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={item.color || 'var(--mint)'}
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={strokeOffset}
                transform="rotate(-90 50 50)"
                style={{
                  transition: 'stroke-dashoffset 0.5s ease',
                }}
              />
            )
          })
        })()}
      </svg>
      <div className="donut-center-text">
        <span className="donut-center-label">{t(centerLabelKey)}</span>
        <span className="donut-center-amount font-mono">
          {hideAmounts ? '***' : `$${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
        </span>
      </div>
    </div>
  )
}
