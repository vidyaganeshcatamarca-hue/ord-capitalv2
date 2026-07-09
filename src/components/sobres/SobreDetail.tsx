import { formatCurrency } from '@/lib/format'
import { t } from '@/locales/i18n'
import type { Sobre } from './types'
import { SobreProjectionChart } from './SobreProjectionChart'
import './SobreDetail.css'

interface SobreDetailProps {
  sobre: Sobre
  onBack: () => void
  onProvision: (sobre: Sobre) => void
  onRescue: (sobre: Sobre) => void
  onEdit: (sobre: Sobre) => void
}

export function SobreDetail({ sobre, onBack, onProvision, onRescue, onEdit }: SobreDetailProps) {
  return (
    <section className="sobre-detail" aria-labelledby="sobre-detail-title">
      <button type="button" className="sobre-detail-back" onClick={onBack}>{t('btn_back')}</button>

      <header className="sobre-detail-header">
        <div>
          <p>{t('sobres_detail')}</p>
          <h2 id="sobre-detail-title">{sobre.nombre}</h2>
        </div>
        <button type="button" onClick={() => onEdit(sobre)}>{t('sobres_edit')}</button>
      </header>

      <div className="sobre-detail-metrics">
        <article>
          <span>{t('sobres_current_balance')}</span>
          <strong>{formatCurrency(sobre.saldo_actual)}</strong>
        </article>
        <article>
          <span>{t('sobres_goal_amount')}</span>
          <strong>{formatCurrency(sobre.monto_meta)}</strong>
        </article>
        <article>
          <span>{t('sobres_missing_amount')}</span>
          <strong>{formatCurrency(sobre.monto_faltante ?? Math.max(sobre.monto_meta - sobre.saldo_actual, 0))}</strong>
        </article>
      </div>

      <article className="sobre-detail-quota">
        <span>{t('sobres_suggested_quota')}</span>
        <strong>{formatCurrency(sobre.cuota_sugerida ?? 0)}</strong>
        <button type="button" onClick={() => onProvision(sobre)}>{t('sobres_provision')}</button>
      </article>

      <section className="sobre-detail-section">
        <h3>{t('sobres_projection_title')}</h3>
        <SobreProjectionChart progreso={sobre.porcentaje_progreso} />
      </section>

      <section className="sobre-detail-section">
        <h3>{t('sobres_history_title')}</h3>
        <p className="sobre-detail-muted">{t('sobres_history_unavailable')}</p>
      </section>

      <div className="sobre-detail-actions">
        <button type="button" onClick={() => onProvision(sobre)}>{t('sobres_provision')}</button>
        <button type="button" onClick={() => onRescue(sobre)}>{t('sobres_rescue')}</button>
      </div>
    </section>
  )
}

export default SobreDetail
