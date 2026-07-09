import { t } from '@/locales/i18n'
import type { HealthPillarKey } from './ScoreRadar'
import './PilaresList.css'

export interface HealthPillarRow {
  key: HealthPillarKey
  score: number
  weight: number
  route: string
}

interface PilaresListProps {
  pillars: HealthPillarRow[]
  onNavigate: (route: string) => void
}

function statusClass(score: number) {
  if (score >= 80) return 'health-pillar-progress health-pillar-progress--excellent'
  if (score >= 60) return 'health-pillar-progress health-pillar-progress--healthy'
  if (score >= 40) return 'health-pillar-progress health-pillar-progress--risk'
  return 'health-pillar-progress health-pillar-progress--critical'
}

function iconFor(key: HealthPillarKey) {
  if (key === 'proteccion') return 'P'
  if (key === 'presupuesto') return '$'
  if (key === 'deuda') return 'D'
  if (key === 'crecimiento') return 'C'
  return 'A'
}

export function PilaresList({ pillars, onNavigate }: PilaresListProps) {
  return (
    <section className="health-pillars" aria-labelledby="health-pillars-title">
      <header className="health-section-header">
        <h2 id="health-pillars-title">{t('health_pillars_title')}</h2>
      </header>

      <div className="health-pillars-list">
        {pillars.map((pillar) => {
          const safeScore = Math.max(0, Math.min(100, Number(pillar.score) || 0))
          return (
            <button key={pillar.key} type="button" className="health-pillar-row" onClick={() => onNavigate(pillar.route)}>
              <span className="health-pillar-icon" aria-hidden="true">{iconFor(pillar.key)}</span>
              <span className="health-pillar-main">
                <span className="health-pillar-name">{t(`health_pillar_${pillar.key}`)}</span>
                <span className="health-pillar-weight">{t('health_weight', { weight: pillar.weight })}</span>
                <span className="health-pillar-track" aria-hidden="true">
                  <span className={statusClass(safeScore)} style={{ width: `${safeScore}%` }} />
                </span>
              </span>
              <span className="health-pillar-score">{safeScore}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default PilaresList
