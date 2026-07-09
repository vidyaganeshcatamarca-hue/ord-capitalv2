import { t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import { SaneamientoWidgetCard } from './SaneamientoWidgetCard'
import type { BolaNieveEstado } from '@/pages/Saneamiento/SaneamientoPage'

interface AtaqueWidgetProps {
  estado: BolaNieveEstado | null
  onDetalle: () => void
}

export function AtaqueWidget({ estado, onDetalle }: AtaqueWidgetProps) {
  if (!estado) {
    return (
      <SaneamientoWidgetCard
        title={t('saneamiento_ataquewidget_titulo')}
        icon="🎯"
        iconBg="rgba(255, 107, 107, 0.15)"
        onClick={onDetalle}
      >
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {t('saneamiento_ataquewidget_vacio')}
        </div>
      </SaneamientoWidgetCard>
    )
  }

  const pct = Math.min(100, Math.max(0, Number(estado.porcentaje_completado) || 0))
  const strategyLabel = t(`saneamiento_estrategia_${estado.estrategia_activa}`)

  return (
    <SaneamientoWidgetCard
      title={t('saneamiento_ataquewidget_titulo')}
      icon="🎯"
      iconBg="rgba(255, 107, 107, 0.15)"
      onClick={onDetalle}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {formatCurrency(estado.deuda_total, 'ARS')}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{t('saneamiento_ataquewidget_deuda_total')}</span>
      </div>

      <div className="saneamiento-progress-bg">
        <div
          className="saneamiento-progress-fill"
          style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--mint)' : pct >= 40 ? 'var(--amber)' : 'var(--coral)' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
        <span>{pct}% {t('saneamiento_ataquewidget_pagado')}</span>
        <span>{formatCurrency(estado.pagado_total, 'ARS')}</span>
      </div>

      <div style={{ fontSize: '14px', marginBottom: '12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{t('saneamiento_ataquewidget_estrategia')}:</span>{' '}
        <strong>{strategyLabel}</strong>
      </div>

      <button className="saneamiento-card-cta" onClick={(e) => { e.stopPropagation(); onDetalle() }}>
        {t('saneamiento_ataquewidget_cta')} →
      </button>
    </SaneamientoWidgetCard>
  )
}
