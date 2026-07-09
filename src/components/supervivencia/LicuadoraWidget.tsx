import type { LicuadoraData } from '@/pages/Supervivencia/SupervivenciaPage'
import { t } from '@/locales/i18n'
import { WarWidgetCard } from './WarWidgetCard'

interface LicuadoraWidgetProps {
  licuadora: LicuadoraData | null
  onDetalle: () => void
}

function semaforoFromLicuadora(l: LicuadoraData): 'verde' | 'amarillo' | 'rojo' | 'neutro' {
  if (l.evolucion.inflacion_acumulada_12m === 0) return 'neutro'
  const real = l.evolucion.variacion_real_12m
  if (real >= 5) return 'verde'
  if (real >= -5) return 'amarillo'
  return 'rojo'
}

function formatPct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
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

export function LicuadoraWidget({ licuadora, onDetalle }: LicuadoraWidgetProps) {
  if (!licuadora) {
    return (
      <WarWidgetCard
        icon="📉"
        title={t('war_licuadora_titulo').replace(/^[^\w]+/, '')}
        semaforo="neutro"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_room_sin_historial')}</p>
      </WarWidgetCard>
    )
  }

  if (licuadora.evolucion.inflacion_acumulada_12m === 0) {
    return (
      <WarWidgetCard
        icon="📉"
        title={t('war_licuadora_titulo').replace(/^[^\w]+/, '')}
        semaforo="neutro"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_licuadora_sin_inflacion')}</p>
      </WarWidgetCard>
    )
  }

  const semaforo = semaforoFromLicuadora(licuadora)
  const real = licuadora.evolucion.variacion_real_12m

  return (
    <WarWidgetCard
      icon="📉"
      title={t('war_licuadora_titulo').replace(/^[^\w]+/, '')}
      subtitle={t('war_licuadora_subtitulo')}
      semaforo={semaforo}
      onDetalle={onDetalle}
    >
      <div className="licuadora-variacion">
        <span className="licuadora-pct">{formatPct(real)}</span>
        <span className="licuadora-periodo">{t('war_licuadora_label_periodo')}</span>
      </div>
      <div className="licuadora-detail-row">
        <span>{t('war_licuadora_label_patrimonio')}</span>
        <strong>{formatMoneyARS(licuadora.actual.patrimonio_neto_ars)}</strong>
      </div>
      <div className="licuadora-detail-row">
        <span>{t('war_licuadora_label_nominal')}</span>
        <strong>{formatPct(licuadora.evolucion.variacion_nominal_12m)}</strong>
      </div>
      <div className="licuadora-detail-row">
        <span>{t('war_licuadora_label_inflacion')}</span>
        <strong>{formatPct(licuadora.evolucion.inflacion_acumulada_12m)}</strong>
      </div>
    </WarWidgetCard>
  )
}
