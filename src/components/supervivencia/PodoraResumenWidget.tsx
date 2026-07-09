import type { PodoraData } from '@/pages/Supervivencia/SupervivenciaPage'
import { t } from '@/locales/i18n'
import { WarWidgetCard } from './WarWidgetCard'

interface PodoraResumenWidgetProps {
  podora: PodoraData | null
  onIrABcg: () => void
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

export function PodoraResumenWidget({ podora, onIrABcg }: PodoraResumenWidgetProps) {
  const tieneCandidatos = (podora?.candidatos?.length ?? 0) > 0
  const totalMes = podora?.candidatos?.reduce((acc, c) => acc + (c.gasto_prom_90d ?? 0), 0) ?? 0

  return (
    <WarWidgetCard
      icon="✂️"
      title={t('war_podora_titulo').replace(/^[^\w]+/, '')}
      subtitle={t('war_podora_subtitulo')}
      semaforo={tieneCandidatos ? 'amarillo' : 'verde'}
      ctaLabel={t('war_podora_cta')}
      onDetalle={onIrABcg}
    >
      {tieneCandidatos ? (
        <>
          <div className="podora-potencial">
            <span className="podora-potencial-label">
              {t('war_podora_label_potencial')}
            </span>
            <div className="podora-potencial-monto">
              <span className="podora-monto">{formatMoneyARS(totalMes)}</span>
              <span className="podora-periodo">{t('war_podora_label_mes')}</span>
            </div>
          </div>
          <p className="podora-mensaje">
            {t('war_podora_mensaje_con', { count: podora?.candidatos.length ?? 0 })}
          </p>
        </>
      ) : (
        <p className="war-widget-empty">{t('war_podora_mensaje_sin')}</p>
      )}
    </WarWidgetCard>
  )
}
