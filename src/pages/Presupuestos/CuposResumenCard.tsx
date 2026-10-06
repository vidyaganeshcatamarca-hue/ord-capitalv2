import { useState } from 'react'
import { t } from '@/locales/i18n'
import './CuposResumenCard.css'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CupoResumen {
  cupo_nombre: string
  porcentaje_configurado: number
  monto_limite: number
  monto_consumido: number
  porcentaje_llenado: number
}

interface Props {
  cupos: CupoResumen[]
}

// Traffic-light thresholds (same cuts as estado_sobre in fn_reporte_sobres_detalle)
const UMBRAL_WARNING = 70
const UMBRAL_OVER = 100

type Estado = 'verde' | 'amarillo' | 'rojo'

const ESTADO_COLOR: Record<Estado, string> = {
  verde: 'var(--mint)',
  amarillo: 'var(--amber)',
  rojo: 'var(--red)',
}

const ESTADO_LABEL_KEY: Record<Estado, string> = {
  verde: 'budget_resumen_state_ok',
  amarillo: 'budget_resumen_state_warning',
  rojo: 'budget_resumen_state_over',
}

// cupo_nombre arrives as an i18n-style key from the RPC
const CUPO_META: Record<string, { labelKey: string; icon: string; color: string }> = {
  needs: { labelKey: 'budget_rule_necesidades', icon: '🏠', color: 'var(--mint)' },
  wants: { labelKey: 'budget_rule_deseos', icon: '✨', color: 'var(--amber)' },
  tithe: { labelKey: 'budget_rule_diezmo', icon: '🙏', color: 'var(--purple)' },
  savings_goal: { labelKey: 'budget_rule_ahorro', icon: '💎', color: 'var(--accent-mint)' },
}

const FALLBACK_META = { labelKey: 'budget_resumen_cupos_title', icon: '•', color: 'var(--text-3)' }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Same convention as formatMonto in PresupuestosPage.tsx (not exported there)
const formatMonto = (n: number) => {
  const abs = Math.abs(n)
  const str = Math.round(abs).toLocaleString('es-AR')
  return n < 0 ? `-$${str}` : `$${str}`
}

const estadoPorLlenado = (pct: number): Estado => {
  if (pct > UMBRAL_OVER) return 'rojo'
  if (pct >= UMBRAL_WARNING) return 'amarillo'
  return 'verde'
}

const peorEstado = (cupos: CupoResumen[]): Estado => {
  const pct = cupos.map(c => Number(c.porcentaje_llenado) || 0)
  if (pct.some(v => v > UMBRAL_OVER)) return 'rojo'
  if (pct.some(v => v >= UMBRAL_WARNING)) return 'amarillo'
  return 'verde'
}

// SVG geometry only: dash arcs from percentages already delivered by the RPC.
interface Arco {
  key: string
  stroke: string
  len: number
  offset: number
  circumference: number
}

const buildArcos = (
  segments: { pct: number; stroke: string; key: string }[],
  radius: number,
): Arco[] => {
  const circumference = 2 * Math.PI * radius
  const active = segments.filter(s => s.pct > 0)
  const gap = active.length > 1 ? 2.5 : 0
  let acc = 0
  return active.map(seg => {
    const preGap = Math.max(0, (seg.pct / 100) * circumference)
    // Tiny slices lose only a proportional gap, never the whole arc
    // (same rule as DonutChart.tsx).
    const segGap = preGap <= gap + 1 ? Math.min(gap, preGap * 0.35) : gap
    const len = Math.max(0, preGap - segGap)
    const offset = -(acc / 100) * circumference
    acc += seg.pct
    return { key: seg.key, stroke: seg.stroke, len, offset, circumference }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CuposResumenCard({ cupos }: Props) {
  const [abierto, setAbierto] = useState(false)

  if (!cupos || cupos.length === 0) return null

  const items = cupos.map(c => {
    const meta = CUPO_META[c.cupo_nombre] || FALLBACK_META
    const llenado = Number(c.porcentaje_llenado) || 0
    return {
      key: c.cupo_nombre,
      meta,
      llenado,
      config: Number(c.porcentaje_configurado) || 0,
      consumido: Number(c.monto_consumido) || 0,
      estado: estadoPorLlenado(llenado) as Estado,
    }
  })

  const worst = peorEstado(cupos)
  const totalConfig = items.reduce((s, i) => s + i.config, 0)
  const totalConsumido = items.reduce((s, i) => s + i.consumido, 0)

  // Outer ring: configured distribution. Inner ring: real consumption shares.
  const arcosConfig = buildArcos(
    items.map(i => ({
      pct: totalConfig > 0 ? (i.config / totalConfig) * 100 : 0,
      stroke: i.meta.color,
      key: `cfg-${i.key}`,
    })),
    38,
  )
  const arcosReal = buildArcos(
    items.map(i => ({
      pct: totalConsumido > 0 ? (i.consumido / totalConsumido) * 100 : 0,
      stroke: i.meta.color,
      key: `real-${i.key}`,
    })),
    24,
  )

  return (
    <div className={`cupos-resumen-card estado-${worst}`}>
      <button
        type="button"
        className="crc-header"
        aria-expanded={abierto}
        onClick={() => setAbierto(prev => !prev)}
      >
        <span className="crc-dot" style={{ background: ESTADO_COLOR[worst] }} />
        <span className="crc-summary">{t(ESTADO_LABEL_KEY[worst])}</span>
        <span className={`crc-chevron ${abierto ? 'abierto' : ''}`}>▸</span>
      </button>

      <div className={`crc-body ${abierto ? 'abierto' : ''}`}>
        <div className="crc-inner">
          <div className="crc-donut-wrap">
            <svg viewBox="0 0 100 100" className="crc-donut">
              <circle cx="50" cy="50" r="38" fill="transparent" style={{ stroke: 'var(--surface-2)' }} strokeWidth="9" />
              <circle cx="50" cy="50" r="24" fill="transparent" style={{ stroke: 'var(--surface-2)' }} strokeWidth="9" />
              {arcosConfig.map(a => (
                <circle
                  key={a.key}
                  cx="50" cy="50" r="38" fill="transparent" strokeWidth="9"
                  style={{ stroke: a.stroke, transition: 'stroke-dasharray 0.5s ease' }}
                  strokeDasharray={`${a.len} ${a.circumference}`}
                  strokeDashoffset={a.offset}
                  transform="rotate(-90 50 50)"
                />
              ))}
              {arcosReal.map(a => (
                <circle
                  key={a.key}
                  cx="50" cy="50" r="24" fill="transparent" strokeWidth="9"
                  style={{ stroke: a.stroke, transition: 'stroke-dasharray 0.5s ease' }}
                  strokeDasharray={`${a.len} ${a.circumference}`}
                  strokeDashoffset={a.offset}
                  transform="rotate(-90 50 50)"
                />
              ))}
              {/* Traffic-light feedback ring */}
              <circle
                cx="50" cy="50" r="45.5" fill="transparent"
                style={{ stroke: ESTADO_COLOR[worst] }} strokeWidth="1.5" opacity="0.6"
              />
            </svg>
            <div className="crc-donut-center">
              <span className="crc-donut-label">{t('budget_resumen_legend_real')}</span>
              <span className="crc-donut-amount font-mono">{formatMonto(totalConsumido)}</span>
            </div>
          </div>

          <div className="crc-legend">
            <div className="crc-legend-row">
              <span className="crc-legend-ring" />
              <span>{t('budget_resumen_legend_ideal')}</span>
              <span className="crc-legend-ring interno" />
              <span>{t('budget_resumen_legend_real')}</span>
            </div>
            {items.map(i => (
              <div key={i.key} className="crc-row">
                <span className="crc-row-icon">{i.meta.icon}</span>
                <div className="crc-row-text">
                  <span className="crc-row-name">{t(i.meta.labelKey)}</span>
                  <span className="crc-row-config">
                    {t('budget_resumen_row_config', { pct: i.config.toFixed(0) })}
                  </span>
                </div>
                <span className={`crc-row-dot ${i.estado}`} style={{ background: ESTADO_COLOR[i.estado] }} />
                <span className="crc-row-pct font-mono" style={{ color: ESTADO_COLOR[i.estado] }}>
                  {i.llenado.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
