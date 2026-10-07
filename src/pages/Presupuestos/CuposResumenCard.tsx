import { useCallback, useState } from 'react'
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

// Open/closed state lives until the tab session closes.
const SESSION_KEY = 'presupuestos_resumen_abierto'

const readAbiertoInicial = (): boolean => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    // Absent → default open.
    return stored === null ? true : stored === '1'
  } catch {
    // sessionStorage unavailable (private mode / non-browser env) → default open
    return true
  }
}

const writeAbierto = (abierto: boolean) => {
  try {
    sessionStorage.setItem(SESSION_KEY, abierto ? '1' : '0')
  } catch {
    // ignore: state still works for this render
  }
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

// Fixed order used for the distribution title in the collapsed header
const PCTS_ORDER = ['needs', 'wants', 'savings_goal', 'tithe']

// cupo_nombre arrives as an i18n-style key from the RPC
const CUPO_META: Record<string, { labelKey: string; icon: string; color: string }> = {
  needs: { labelKey: 'budget_rule_necesidades', icon: '🏠', color: 'var(--mint)' },
  wants: { labelKey: 'budget_rule_deseos', icon: '✨', color: 'var(--amber)' },
  tithe: { labelKey: 'budget_rule_diezmo', icon: '🙏', color: 'var(--purple)' },
  savings_goal: { labelKey: 'budget_rule_ahorro', icon: '💎', color: 'var(--accent-mint)' },
}

const FALLBACK_META = { labelKey: 'budget_resumen_cupos_title', icon: '•', color: 'var(--text-3)' }

// ── Helpers ───────────────────────────────────────────────────────────────────

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


// ── Component ─────────────────────────────────────────────────────────────────

export function CuposResumenCard({ cupos }: Props) {
  const [abierto, setAbierto] = useState<boolean>(readAbiertoInicial)

  const toggle = useCallback(() => {
    setAbierto(prev => {
      const next = !prev
      writeAbierto(next)
      return next
    })
  }, [])

  if (!cupos || cupos.length === 0) return null

  const items = cupos.map(c => {
    const meta = CUPO_META[c.cupo_nombre] || FALLBACK_META
    const llenado = Number(c.porcentaje_llenado) || 0
    return {
      key: c.cupo_nombre,
      meta,
      llenado,
      config: Number(c.porcentaje_configurado) || 0,
      estado: estadoPorLlenado(llenado) as Estado,
    }
  })

  // Cupos with no configured share are not shown at all.
  const visibles = items.filter(i => i.config > 0)
  if (visibles.length === 0) return null

  // Bigger configured share first; Array.sort is stable, so RPC order breaks ties.
  const rows = [...visibles].sort((a, b) => b.config - a.config)

  const pcts = PCTS_ORDER.map(
    name => (Number(cupos.find(c => c.cupo_nombre === name)?.porcentaje_configurado) || 0).toFixed(0),
  ).join('-')

  const worst = peorEstado(cupos)

  return (
    <div className={`cupos-resumen-card estado-${worst}`}>
      <button
        type="button"
        className="crc-header"
        aria-expanded={abierto}
        onClick={toggle}
      >
        <span className="crc-dot" style={{ background: ESTADO_COLOR[worst] }} />
        <span className="crc-summary">{t('budget_resumen_distribucion_title', { pcts })}</span>
        <span className={`crc-chevron ${abierto ? 'abierto' : ''}`}>▸</span>
      </button>

      <div className={`crc-body ${abierto ? 'abierto' : ''}`}>
        <div className="crc-body-inner">
          <div className="crc-rows">
            {rows.map(i => {
              const over = i.llenado > UMBRAL_OVER
              const fillPct = Math.min(Math.max(i.llenado, 0), 100)
              const fillColor = over ? 'var(--red)' : ESTADO_COLOR[i.estado]
              return (
                <div key={i.key} className="crc-row">
                  <span className="crc-row-icon">{i.meta.icon}</span>
                  <div className="crc-row-text">
                    <span className="crc-row-name">{t(i.meta.labelKey)}</span>
                    <span className="crc-row-config">
                      {t('budget_resumen_row_config', { pct: i.config.toFixed(0) })}
                    </span>
                  </div>
                  <span className={`crc-row-dot ${i.estado}`} style={{ background: ESTADO_COLOR[i.estado] }} />
                  <span
                    className="crc-row-pct font-mono"
                    style={{ color: over ? 'var(--red)' : ESTADO_COLOR[i.estado] }}
                  >
                    {i.llenado.toFixed(0)}%
                  </span>
                  <div className="crc-row-bar">
                    <div
                      className="crc-row-bar-fill"
                      style={{ width: `${fillPct}%`, background: fillColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
