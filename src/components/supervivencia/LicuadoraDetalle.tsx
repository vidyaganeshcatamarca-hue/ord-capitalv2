import { t } from '@/locales/i18n'
import type { LicuadoraData } from '@/pages/Supervivencia/SupervivenciaPage'
import './LicuadoraDetalle.css'

interface LicuadoraDetalleProps {
  licuadora: LicuadoraData
  onIrAInversiones: () => void
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

function formatPct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

export function LicuadoraDetalle({ licuadora, onIrAInversiones }: LicuadoraDetalleProps) {
  const evo = licuadora.evolucion
  const nominal = evo.variacion_nominal_12m
  const inflacion = evo.inflacion_acumulada_12m
  const real = evo.variacion_real_12m
  const maxVal = Math.max(Math.abs(nominal), Math.abs(inflacion), 10)
  const nominalPct = Math.min(100, (Math.abs(nominal) / maxVal) * 100)
  const inflacionPct = Math.min(100, (Math.abs(inflacion) / maxVal) * 100)

  let insight = ''
  if (real > 5) {
    insight = t('war_licuadora_insight_positivo', { pct: real.toFixed(1) })
  } else if (real < -5) {
    insight = t('war_licuadora_insight_negativo', { pct: Math.abs(real).toFixed(1) })
  } else {
    insight = t('war_licuadora_insight_neutro')
  }

  return (
    <section className="lic-detalle">
      <header className="lic-detalle-header">
        <span className="lic-detalle-kicker">{t('war_licuadora_detalle_kicker')}</span>
        <h2 className="font-display">{t('war_licuadora_detalle_titulo')}</h2>
        <p className="lic-detalle-periodo">{t('war_licuadora_detalle_periodo')}</p>
      </header>

      <div className="lic-tarjetas">
        <div className="lic-tarjeta">
          <span className="lic-tarjeta-label">{t('war_licuadora_label_patrimonio')}</span>
          <strong className="lic-tarjeta-valor">{formatMoneyARS(licuadora.actual.patrimonio_neto_ars)}</strong>
        </div>
        <div className="lic-tarjeta">
          <span className="lic-tarjeta-label">{t('war_licuadora_label_nominal')}</span>
          <strong className={`lic-tarjeta-valor ${nominal >= 0 ? 'positivo' : 'negativo'}`}>
            {formatPct(nominal)}
          </strong>
        </div>
        <div className="lic-tarjeta">
          <span className="lic-tarjeta-label">{t('war_licuadora_label_inflacion')}</span>
          <strong className="lic-tarjeta-valor negativo">{formatPct(inflacion)}</strong>
        </div>
      </div>

      <section className="lic-grafico">
        <h3>{t('war_licuadora_label_real')}</h3>
        <div className={`lic-real-grande lic-real-${real > 5 ? 'positivo' : real < -5 ? 'negativo' : 'neutro'}`}>
          {formatPct(real)}
        </div>

        <div className="lic-barras">
          <div className="lic-barra-row">
            <span className="lic-barra-label">Tu patrimonio</span>
            <div className="lic-barra-track">
              <div
                className={`lic-barra-fill lic-barra-${nominal >= 0 ? 'azul' : 'rojo'}`}
                style={{ width: `${nominalPct}%` }}
              />
            </div>
            <span className="lic-barra-valor">{formatPct(nominal)}</span>
          </div>
          <div className="lic-barra-row">
            <span className="lic-barra-label">{t("inflation_badge")}</span>
            <div className="lic-barra-track">
              <div
                className="lic-barra-fill lic-barra-rojo"
                style={{ width: `${inflacionPct}%` }}
              />
            </div>
            <span className="lic-barra-valor">{formatPct(inflacion)}</span>
          </div>
        </div>
      </section>

      <section className="lic-insight">
        <h3>{t('war_licuadora_insight_titulo')}</h3>
        <p>{insight}</p>
      </section>

      {real < 5 && (
        <button
          type="button"
          className="btn btn-primary lic-cta-inversiones"
          onClick={onIrAInversiones}
        >
          {t('war_licuadora_cta_inversiones')}
        </button>
      )}
    </section>
  )
}
