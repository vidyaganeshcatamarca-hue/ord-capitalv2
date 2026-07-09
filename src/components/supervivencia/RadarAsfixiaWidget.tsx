import type { RadarData } from '@/pages/Supervivencia/SupervivenciaPage'
import { t } from '@/locales/i18n'
import { WarWidgetCard } from './WarWidgetCard'

interface RadarAsfixiaWidgetProps {
  radar: RadarData[]
  onDetalle: () => void
}

function semaforoFromRadar(radar: RadarData[]): 'verde' | 'amarillo' | 'rojo' {
  const rojos = radar.filter((r) => r.estado_dia === 'red').length
  if (rojos === 0) return 'verde'
  if (rojos <= 2) return 'amarillo'
  return 'rojo'
}

export function RadarAsfixiaWidget({ radar, onDetalle }: RadarAsfixiaWidgetProps) {
  if (!radar || radar.length === 0) {
    return (
      <WarWidgetCard
        icon="🌡️"
        title={t('war_radar_titulo').replace(/^[^\w]+/, '')}
        semaforo="neutro"
        onDetalle={onDetalle}
      >
        <p className="war-widget-empty">{t('war_radar_sin_billeteras')}</p>
      </WarWidgetCard>
    )
  }

  const semaforo = semaforoFromRadar(radar)
  const { diasRojos, diasAmarillos } = radar.reduce(
    (acc, r) => {
      if (r.estado_dia === 'red') acc.diasRojos++
      else if (r.estado_dia === 'yellow') acc.diasAmarillos++
      return acc
    },
    { diasRojos: 0, diasAmarillos: 0 }
  )

  return (
    <WarWidgetCard
      icon="🌡️"
      title={t('war_radar_titulo').replace(/^[^\w]+/, '')}
      subtitle={t('war_radar_subtitulo')}
      semaforo={semaforo}
      onDetalle={onDetalle}
    >
      {diasRojos > 0 ? (
        <>
          <div className="radar-criticos">
            <span className="radar-criticos-num">{diasRojos}</span>
            <span className="radar-criticos-label">
              {t('war_radar_label_criticos')}
            </span>
          </div>
          <div className="radar-progress">
            <div className="radar-progress-bar">
              <div
                className="radar-progress-fill radar-progress-rojo"
                style={{ width: `${(diasRojos / 30) * 100}%` }}
              />
              <div
                className="radar-progress-fill radar-progress-amarillo"
                style={{
                  width: `${(diasAmarillos / 30) * 100}%`,
                  left: `${(diasRojos / 30) * 100}%`,
                }}
              />
            </div>
            <div className="radar-progress-labels">
              <span>30d</span>
            </div>
          </div>
        </>
      ) : (
        <p className="war-widget-empty radar-ok">{t('war_radar_label_seguro')}</p>
      )}
    </WarWidgetCard>
  )
}
