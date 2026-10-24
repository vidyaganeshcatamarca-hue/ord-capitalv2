import { t } from '@/locales/i18n'

export interface DistribucionActivoRow {
  tipo_activo: 'plazo_fijo' | 'variable' | string
  cantidad: number
  valor_total: number
  porcentaje_valor: number
  // S6 (2026-10-24): con la migración 91 hay una fila por inversión.
  inversion_id?: number | null
  nombre_activo?: string | null
  // S6b: valor en la moneda propia de la inversión (lo que se muestra primero) y
  // valor_total convertido a moneda local (entre paréntesis).
  valor_propio?: number | null
  moneda?: string | null
}

interface DistribucionDonutProps {
  data: DistribucionActivoRow[]
  size?: number
}

const COLORS: Record<string, string> = {
  plazo_fijo: '#3B82F6',
  variable: '#8B5CF6',
}

// Paleta por inversión: cada porción tiene que distinguirse de la de al lado,
// incluso cuando las dos son 'variable'.
const SERIES_COLORS = [
  '#8B5CF6',
  '#3B82F6',
  '#14B8A6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#22C55E',
  '#64748B',
]

function colorFor(item: DistribucionActivoRow, index: number): string {
  const nombre = typeof item.nombre_activo === 'string' ? item.nombre_activo.trim() : ''
  if (nombre) return SERIES_COLORS[index % SERIES_COLORS.length]
  return COLORS[item.tipo_activo] ?? '#64748B'
}

function keyFor(item: DistribucionActivoRow, index: number): string {
  if (item.inversion_id !== null && item.inversion_id !== undefined) {
    return `inv-${item.inversion_id}`
  }
  const nombre = typeof item.nombre_activo === 'string' ? item.nombre_activo.trim() : ''
  return nombre || `${item.tipo_activo}-${index}`
}

export function DistribucionDonut({ data, size = 168 }: DistribucionDonutProps) {
  // S13 (2026-10-22): el donut a 220px empujaba la tabla fuera de pantalla y
  // obligaba a scrollear con solo dos inversiones. A 168px entran el gráfico y
  // la tabla en un teléfono. El detalle de muchas inversiones sí scrollea (ahí
  // manda la tabla, no el círculo).
  const strokeWidth = 18
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

        {hasData && activeData.map((item, idx) => {
          const length = (Math.min(item.porcentaje_valor, 100) / 100) * circumference
          const gap = activeData.length > 1 ? 2.5 : 0
          const strokeLength = Math.max(0, length - gap)
          const dashOffset = -offset
          offset += length

          return (
            <circle
              key={keyFor(item, idx)}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colorFor(item, idx)}
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
