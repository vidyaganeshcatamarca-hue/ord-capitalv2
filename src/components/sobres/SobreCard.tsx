import { formatCurrency } from '@/lib/format'
import { t } from '@/locales/i18n'
import type { Sobre } from './types'
import './SobreCard.css'

interface SobreCardProps {
  sobre: Sobre
  onSelect: (sobre: Sobre) => void
  onProvision: (sobre: Sobre) => void
  onRescue: (sobre: Sobre) => void
  onEdit: (sobre: Sobre) => void
  onArchive: (sobre: Sobre) => void
}

function progressWidth(value: number) {
  return `${Math.max(0, Math.min(100, Number(value) || 0))}%`
}

function statusClass(status: string) {
  if (status === 'state_fulfilled') return 'sobre-card-status sobre-card-status--fulfilled'
  if (status === 'state_overdue') return 'sobre-card-status sobre-card-status--overdue'
  if (status === 'state_critical') return 'sobre-card-status sobre-card-status--critical'
  return 'sobre-card-status sobre-card-status--progress'
}

export function SobreCard({ sobre, onSelect, onProvision, onRescue, onEdit, onArchive }: SobreCardProps) {
  return (
    <article className="sobre-card">
      <button type="button" className="sobre-card-main" onClick={() => onSelect(sobre)}>
        <header className="sobre-card-header">
          <div>
            <h3>{sobre.nombre}</h3>
            <p>{formatCurrency(sobre.saldo_actual)} / {formatCurrency(sobre.monto_meta)}</p>
          </div>
          <span className={statusClass(sobre.estado_alerta_key)}>{t(sobre.estado_alerta_key)}</span>
        </header>

        <div className="sobre-card-progress" aria-label={t('sobres_progress')}>
          <span style={{ width: progressWidth(sobre.porcentaje_progreso) }} />
        </div>

        <footer className="sobre-card-meta">
          <span>{sobre.dias_restantes < 0 ? t('sobres_goal_overdue') : t('sobres_days_left', { days: sobre.dias_restantes })}</span>
          {sobre.cuota_sugerida !== undefined && (
            <strong>{t('sobres_suggested_quota')}: {formatCurrency(sobre.cuota_sugerida)}</strong>
          )}
        </footer>
      </button>

      <div className="sobre-card-actions">
        <button type="button" onClick={() => onProvision(sobre)}>{t('sobres_provision')}</button>
        <button type="button" onClick={() => onRescue(sobre)}>{t('sobres_rescue')}</button>
        <button type="button" onClick={() => onEdit(sobre)}>{t('sobres_edit')}</button>
        <button type="button" className="sobre-card-danger" onClick={() => onArchive(sobre)}>{t('sobres_archive')}</button>
      </div>
    </article>
  )
}

export default SobreCard
