import { t } from '@/locales/i18n'
import { ScoreRadar, type HealthDimensions } from './ScoreRadar'
import './ScoreHero.css'

interface ScoreHeroProps {
  score: number | null
  estado: string
  dimensiones: HealthDimensions
  delta?: number | null
}

function scoreClass(score: number | null) {
  if (score === null) return 'score-hero-value score-hero-value--empty'
  if (score >= 80) return 'score-hero-value score-hero-value--excellent'
  if (score >= 60) return 'score-hero-value score-hero-value--healthy'
  if (score >= 40) return 'score-hero-value score-hero-value--risk'
  return 'score-hero-value score-hero-value--critical'
}

function badgeClass(score: number | null) {
  if (score === null) return 'score-hero-badge score-hero-badge--empty'
  if (score >= 80) return 'score-hero-badge score-hero-badge--excellent'
  if (score >= 60) return 'score-hero-badge score-hero-badge--healthy'
  if (score >= 40) return 'score-hero-badge score-hero-badge--risk'
  return 'score-hero-badge score-hero-badge--critical'
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`
  return String(delta)
}

export function ScoreHero({ score, estado, dimensiones, delta }: ScoreHeroProps) {
  const safeScore = score === null ? null : Math.max(0, Math.min(100, Number(score) || 0))

  return (
    <section className="score-hero" aria-labelledby="health-score-title">
      <div className="score-hero-copy">
        <p className="score-hero-eyebrow">{t('health_score_global')}</p>
        <h1 id="health-score-title" className={scoreClass(safeScore)}>
          {safeScore === null ? t('health_no_score') : t('health_score_out_of', { score: safeScore })}
        </h1>
        <span className={badgeClass(safeScore)}>{t(estado)}</span>
        {delta !== null && delta !== undefined && (
          <p className="score-hero-delta">{t('health_vs_previous', { delta: formatDelta(delta) })}</p>
        )}
      </div>

      <ScoreRadar dimensiones={dimensiones} />
    </section>
  )
}

export default ScoreHero
