import { t } from '@/locales/i18n'

export interface DistribucionActivoRow {
  tipo_activo: 'plazo_fijo' | 'variable' | string
  cantidad: number
  valor_total: number
  porcentaje_valor: number
}

interface DistribucionDonutProps {
  data: DistribucionActivoRow[]
  size?: number
}

const COLORS: Record<string, string> = {
  plazo_fijo: '#3B82F6',
  variable: '#8B5CF6',
}

function colorFor(tipo: string): string {
  return COLORS[tipo] ?? '#64748B'
}

export function DistribucionDonut({ data, size = 220 }: DistribucionDonutProps) {
  const strokeWidth = 22
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const activeData = data.filter((item) => item.porcentaje_valor > 0)
  const hasData = activeData.length > 0
  let offset = 0

  return (
    <div className="distribucion-donut" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={t('distribution_subtitle')}
        className="distribucion-donut-svg"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(100, 116, 139, 0.22)"
          strokeWidth={strokeWidth}
        />

        {hasData && activeData.map((item) => {
          const length = (Math.min(item.porcentaje_valor, 100) / 100) * circumference
          const gap = activeData.length > 1 ? 2.5 : 0
          const strokeLength = Math.max(0, length - gap)
          const dashOffset = -offset
          offset += length

          return (
            <circle
              key={item.tipo_activo}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colorFor(item.tipo_activo)}
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${center} ${center})`}
            />
          )
        })}

        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="distribucion-donut-label"
        >
          {hasData ? '100%' : '0%'}
        </text>
      </svg>
    </div>
  )
}

export default DistribucionDonut
