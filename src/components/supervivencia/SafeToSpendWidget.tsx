import type { SafeData } from '@/pages/Supervivencia/SupervivenciaPage'
import { t } from '@/locales/i18n'
import { WarWidgetCard } from './WarWidgetCard'

interface SafeToSpendWidgetProps {
  safe: SafeData | null
  onDetalle: () => void
}

function semaforoFromSafe(s: SafeData): 'verde' | 'amarillo' | 'rojo' {
  if (s.estado_semaforo_key === 'green') return 'verde'
  if (s.estado_semaforo_key === 'yellow') return 'amarillo'
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

function luzKeyToLabel(key: SafeData['estado_semaforo_key']): string {
  if (key === 'green') return t('war_safe_luz_verde')
  if (key === 'yellow') return t('war_safe_luz_amarilla')
  return t('war_safe_luz_roja')
}

export function SafeToSpendWidget({ safe, onDetalle }: SafeToSpendWidgetProps) {
  if (!safe) {
    return (
      <WarWidgetCard
        icon="☕"
        title={t('war_safe_titulo').replace(/^[^\w]+/, '')}
        semaforo="neutro"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_safe_sin_ingresos')}</p>
      </WarWidgetCard>
    )
  }

  if (safe.saldo_operativo <= 0) {
    return (
      <WarWidgetCard
        icon="☕"
        title={t('war_safe_titulo').replace(/^[^\w]+/, '')}
        semaforo="rojo"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_safe_sin_billeteras')}</p>
      </WarWidgetCard>
    )
  }

  const semaforo = semaforoFromSafe(safe)
  const diario = safe.safe_to_spend_diario
  const labelLuz = luzKeyToLabel(safe.estado_semaforo_key)

  return (
    <WarWidgetCard
      icon="☕"
      title={t('war_safe_titulo').replace(/^[^\w]+/, '')}
      subtitle={t('war_safe_subtitulo')}
      semaforo={semaforo}
      onDetalle={onDetalle}
    >
      <div className="safe-numero-grande">
        <span className="safe-monto">{formatMoneyARS(diario)}</span>
        <span className="safe-luz">{labelLuz}</span>
      </div>
      <p className="safe-mensaje">{t(safe.mensaje_sistema_key, { defaultValue: '' })}</p>
    </WarWidgetCard>
  )
}
