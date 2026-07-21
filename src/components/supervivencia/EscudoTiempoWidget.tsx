import type { EscudoData } from '@/pages/Supervivencia/SupervivenciaPage'
import { t } from '@/locales/i18n'
import { WarWidgetCard } from './WarWidgetCard'

interface EscudoTiempoWidgetProps {
  escudo: EscudoData | null
  onDetalle: () => void
}

function semaforoFromEscudo(e: EscudoData): 'verde' | 'amarillo' | 'rojo' {
  if (e.estado_alerta_key === 'safe') return 'verde'
  if (e.estado_alerta_key === 'warning') return 'amarillo'
  return 'rojo'
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

export function EscudoTiempoWidget({ escudo, onDetalle }: EscudoTiempoWidgetProps) {
  if (!escudo) {
    return (
      <WarWidgetCard
        icon="⏱️"
        title={t('war_escudo_titulo').replace(/^[^\w]+/, '')}
        semaforo="neutro"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_room_sin_historial')}</p>
      </WarWidgetCard>
    )
  }

  const semaforo = semaforoFromEscudo(escudo)
  const dias = escudo.dias_supervivencia_deuda_total
  const meses = (dias / 30).toFixed(1)

  return (
    <WarWidgetCard
      icon="⏱️"
      title={t('war_escudo_titulo').replace(/^[^\w]+/, '')}
      semaforo={semaforo}
      onDetalle={onDetalle}
    >
      <div className="escudo-numero-grande">
        <span className="escudo-dias">{dias}</span>
        <span className="escudo-unidad">{t('war_escudo_unidad_dias')}</span>
      </div>
      <div className="escudo-meta">
        <span>{t('war_escudo_label_meses', { meses })}</span>
      </div>
      <div className="escudo-detail-row">
        <span>{t('war_escudo_label_liquidez')}</span>
        <strong>{formatMoneyARS(escudo.arsenal_total)}</strong>
      </div>
      <div className="escudo-detail-row">
        <span>{t('war_escudo_label_deuda')}</span>
        <strong>{formatMoneyARS(escudo.deuda_total)}</strong>
      </div>
      <div className="escudo-detail-row">
        <span>{t('war_escudo_label_quemado')}</span>
        <strong>{formatMoneyARS(escudo.burn_rate_supervivencia)}{t("shield_per_day")}</strong>
      </div>
      {escudo.capital_real <= 0 && (
        <p className="escudo-alerta-roja">⚠️ {t('war_room_sin_liquidez')}</p>
      )}
    </WarWidgetCard>
  )
}
