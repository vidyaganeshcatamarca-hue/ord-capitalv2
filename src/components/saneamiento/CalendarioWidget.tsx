import { t } from '@/locales/i18n'
import { SaneamientoWidgetCard } from './SaneamientoWidgetCard'
import type { CalendarioEvento } from '@/pages/Saneamiento/SaneamientoPage'

interface CalendarioWidgetProps {
  eventos: CalendarioEvento[]
  onDetalle: () => void
}

export function CalendarioWidget({ eventos, onDetalle }: CalendarioWidgetProps) {
  const total = eventos.length
  // Semáforo por fecha: rojo a 3 días o menos (o ya vencido), amarillo hasta 10,
  // verde más de 10. Reemplaza al umbral de importe, que no puede ser genérico
  // en una app global.
  const urgentes = eventos.filter((e) => e.criticidad === 'critico').length
  const proximos = eventos.filter((e) => e.criticidad === 'atencion').length
  const conMargen = eventos.filter((e) => e.criticidad === 'normal').length

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
            {urgentes > 0 && (
              <span className="saneamiento-badge" style={{ background: 'rgba(255, 107, 107, 0.15)', color: 'var(--coral)' }}>
                🔴 {urgentes} {t('saneamiento_calendariowidget_urgentes')}
              </span>
            )}
            {proximos > 0 && (
              <span className="saneamiento-badge" style={{ background: 'rgba(255, 230, 109, 0.15)', color: 'var(--amber)' }}>
                🟡 {proximos} {t('saneamiento_calendariowidget_proximos')}
              </span>
            )}
            {conMargen > 0 && (
              <span className="saneamiento-badge" style={{ background: 'rgba(74, 222, 128, 0.15)', color: 'var(--mint, #4ade80)' }}>
                🟢 {conMargen} {t('saneamiento_calendariowidget_con_margen')}
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
