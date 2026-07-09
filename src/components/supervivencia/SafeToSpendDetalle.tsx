import { t } from '@/locales/i18n'
import type { SafeData } from '@/pages/Supervivencia/SupervivenciaPage'
import './SafeToSpendDetalle.css'

interface SafeToSpendDetalleProps {
  safe: SafeData
}

function formatMoneyARS(v: number): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    return `$${Math.round(v).toLocaleString('es-AR')}`
  }
}

export function SafeToSpendDetalle({ safe }: SafeToSpendDetalleProps) {
  return (
    <section className="safe-detalle">
      <header className="safe-detalle-header">
        <span className="safe-detalle-kicker">{t('war_safe_detalle_kicker')}</span>
        <h2 className="font-display">{t('war_safe_detalle_titulo')}</h2>
      </header>

      <div className="safe-numero-gigante">
        <span className="safe-numero-gigante-monto">{formatMoneyARS(safe.safe_to_spend_diario)}</span>
        <span
          className={`safe-numero-gigante-semaforo safe-semaforo-${safe.estado_semaforo_key}`}
        >
          {safe.estado_semaforo_key === 'green'
            ? t('war_safe_luz_verde')
            : safe.estado_semaforo_key === 'yellow'
              ? t('war_safe_luz_amarilla')
              : t('war_safe_luz_roja')}
        </span>
      </div>

      <section className="safe-desglose">
        <h3>{t('war_safe_desglose_titulo')}</h3>
        <ul>
          <li>
            <span>💰 {t('war_safe_label_saldo')}</span>
            <strong>{formatMoneyARS(safe.saldo_operativo)}</strong>
          </li>
          <li>
            <span>🛡️ {t('war_safe_label_fijos')}</span>
            <strong className="negativo">−{formatMoneyARS(safe.blindaje_fijos_7d)}</strong>
          </li>
          <li>
            <span>💳 {t('war_safe_label_deudas')}</span>
            <strong className="negativo">−{formatMoneyARS(safe.blindaje_deudas_7d)}</strong>
          </li>
          <li className="safe-destacado">
            <span>= {t('war_safe_label_disponible')}</span>
            <strong>{formatMoneyARS(safe.capital_libre_semana)}</strong>
          </li>
          <li>
            <span>📅 {t('war_safe_label_dias')}</span>
            <strong>{safe.dias_restantes_mes}</strong>
          </li>
          <li className="safe-destacado safe-final">
            <span>= {t('war_safe_label_diario')}</span>
            <strong>{formatMoneyARS(safe.safe_to_spend_diario)}</strong>
          </li>
        </ul>
      </section>

      <p className="safe-mensaje-sistema">
        {t(safe.mensaje_sistema_key, { defaultValue: '' })}
      </p>
    </section>
  )
}
