import { t } from '@/locales/i18n'
import { SaneamientoWidgetCard } from './SaneamientoWidgetCard'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface BandejaWidgetProps {
  items: CuarentenaItem[]
  onDetalle: () => void
}

export function BandejaWidget({ items, onDetalle }: BandejaWidgetProps) {
  const total = items.length
  const ocr = items.filter((i) => i.origen === 'ocr').length
  const recurrentes = items.filter((i) => i.origen === 'recurrente').length
  const voz = items.filter((i) => i.origen === 'voz').length

  return (
    <SaneamientoWidgetCard
      title={t('saneamiento_bandejawidget_titulo')}
      icon="📥"
      iconBg="rgba(78, 205, 196, 0.15)"
      onClick={onDetalle}
    >
      {total === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'calc(14px * var(--font-scale))' }}>
          {t('saneamiento_bandejawidget_vacio')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: 'calc(32px * var(--font-scale))', fontWeight: 800, fontFamily: 'var(--font-display)' }}>{total}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'calc(14px * var(--font-scale))' }}>{t('saneamiento_bandejawidget_pendientes')}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {ocr > 0 && <span className="saneamiento-badge saneamiento-badge-ocr">📷 {ocr} OCR</span>}
            {recurrentes > 0 && <span className="saneamiento-badge saneamiento-badge-recurrente">🔄 {recurrentes} {t('saneamiento_recurrentes')}</span>}
            {voz > 0 && <span className="saneamiento-badge saneamiento-badge-voz">🎙️ {voz} {t('saneamiento_voz')}</span>}
          </div>

          <button className="saneamiento-card-cta" onClick={(e) => { e.stopPropagation(); onDetalle() }}>
            {t('saneamiento_bandejawidget_cta')} →
          </button>
        </>
      )}
    </SaneamientoWidgetCard>
  )
}
