import { t } from '@/locales/i18n'
import './InsightsList.css'

export interface HealthInsight {
  priority: 'high' | 'medium' | 'low' | string
  dimension: string
  message_key: string
  params: Record<string, unknown>
  action_route: string
}

interface InsightsListProps {
  insights: HealthInsight[]
  unavailable?: boolean
  onNavigate: (route: string) => void
}

function priorityKey(priority: string) {
  if (priority === 'high') return 'health_priority_high'
  if (priority === 'medium') return 'health_priority_medium'
  return 'health_priority_low'
}

function priorityIcon(priority: string) {
  if (priority === 'high') return '!'
  if (priority === 'medium') return 'i'
  return 'OK'
}

export function InsightsList({ insights, unavailable = false, onNavigate }: InsightsListProps) {
  const visibleInsights = insights.slice(0, 2)

  return (
    <section className="health-insights" aria-labelledby="health-insights-title">
      <header className="health-section-header">
        <h2 id="health-insights-title">{t('health_insights_title')}</h2>
      </header>

      {unavailable && visibleInsights.length === 0 ? (
        <article className="health-insight-card health-insight-card--muted">
          <span className="health-insight-icon">i</span>
          <p>{t('health_insights_unavailable')}</p>
        </article>
      ) : visibleInsights.length === 0 ? (
        <article className="health-insight-card health-insight-card--positive">
          <span className="health-insight-icon">OK</span>
          <p>{t('health_positive_empty')}</p>
        </article>
      ) : (
        <div className="health-insights-list">
          {visibleInsights.map((insight) => (
            <article key={`${insight.dimension}-${insight.message_key}`} className={`health-insight-card health-insight-card--${insight.priority}`}>
              <span className="health-insight-icon">{priorityIcon(insight.priority)}</span>
              <div className="health-insight-body">
                <span className="health-insight-priority">{t(priorityKey(insight.priority))}</span>
                <p>{t(insight.message_key, insight.params)}</p>
                <button type="button" className="health-link-button" onClick={() => onNavigate(insight.action_route)}>
                  {t('health_action_view_detail')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default InsightsList
