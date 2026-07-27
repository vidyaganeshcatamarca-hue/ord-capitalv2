import { t } from '@/locales/i18n'
import { SaneamientoWidgetCard } from './SaneamientoWidgetCard'
import type { CalendarioEvento } from '@/pages/Saneamiento/SaneamientoPage'

interface CalendarioWidgetProps {
  eventos: CalendarioEvento[]
  onDetalle: () => void
}

export function CalendarioWidget({ eventos, onDetalle }: CalendarioWidgetProps) {
  const total = eventos.length
  const criticos = eventos.filter((e) => e.criticidad === 'critico').length
  const normales = total - criticos

  return (
    <SaneamientoWidgetCard
      title={t('saneamiento_calendariowidget_titulo')}
      icon="📅"
      iconBg="rgba(255, 230, 109, 0.15)"
      onClick={onDetalle}
    >
      {total === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'calc(14px * var(--font-scale))' }}>
          {t('saneamiento_calendariowidget_vacio')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: 'calc(32px * var(--font-scale))', fontWeight: 800, fontFamily: 'var(--font-display)' }}>{total}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'calc(14px * var(--font-scale))' }}>{t('saneamiento_calendariowidget_vencimientos')}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {criticos > 0 && (
              <span className="saneamiento-badge" style={{ background: 'rgba(255, 107, 107, 0.15)', color: 'var(--coral)' }}>
                🔴 {criticos} {t('saneamiento_calendariowidget_criticos')}
              </span>
            )}
            {normales > 0 && (
              <span className="saneamiento-badge" style={{ background: 'rgba(255, 230, 109, 0.15)', color: 'var(--amber)' }}>
                🟡 {normales} {t('saneamiento_calendariowidget_normales')}
              </span>
            )}
          </div>

          <button className="saneamiento-card-cta" onClick={(e) => { e.stopPropagation(); onDetalle() }}>
            {t('saneamiento_calendariowidget_cta')} →
          </button>
        </>
      )}
    </SaneamientoWidgetCard>
  )
}
