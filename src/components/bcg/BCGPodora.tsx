import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import {
  formatMoneyARS,
  mejorEquivalencia,
  diasAntesMeta,
  diasExtraEscudo,
} from '@/lib/bcgUtils'
import './BCGPodora.css'

export interface PodoraCandidatoFE {
  estructura_id: number
  nombre: string
  icono: string
  color: string
  gasto_prom_90d: number
  utilidad_placer: number
  flexibilidad_recorte: number
}

export interface PodoraMetaFE {
  billetera_id: number
  nombre: string
  monto_meta: number
  saldo_actual: number
  dias_restantes: number
}

export interface PodoraLineaBaseFE {
  arsenal_total: number
  deuda_total: number
  burn_rate_supervivencia: number
  escudo_dias_actual: number
}

interface BCGPodoraProps {
  candidatos: PodoraCandidatoFE[]
  metas: PodoraMetaFE[]
  tieneMetas: boolean
  lineaBase: PodoraLineaBaseFE
  onCandidatoClick: (estructuraId: number) => void
}

type DestinoSimulador = 'supervivencia' | 'meta'

export function BCGPodora({ candidatos, metas, tieneMetas, lineaBase, onCandidatoClick }: BCGPodoraProps) {
  const navigate = useNavigate()
  const [sliders, setSliders] = useState<Record<number, number>>({})
  const [destino, setDestino] = useState<DestinoSimulador>('supervivencia')

  const handleSlider = (id: number, value: number) => {
    haptics.light()
    setSliders((s) => ({ ...s, [id]: value }))
  }

  const totalMensual = useMemo(() => {
    return candidatos.reduce((acc, c) => {
      const pct = (sliders[c.estructura_id] ?? 100) / 100
      return acc + c.gasto_prom_90d * pct
    }, 0)
  }, [candidatos, sliders])

  const totalAnual = totalMensual * 12
  const equivalencia = mejorEquivalencia(totalAnual)

  const metaPrioritaria = metas[0] ?? null
  const metaFaltante = metaPrioritaria ? Math.max(metaPrioritaria.monto_meta - metaPrioritaria.saldo_actual, 0) : 0

  const impacto = destino === 'supervivencia'
    ? diasExtraEscudo(totalMensual, lineaBase.burn_rate_supervivencia)
    : diasAntesMeta(metaFaltante, totalMensual)

  if (candidatos.length === 0) {
    return (
      <div className="bcg-podora-empty">
        <span className="bcg-podora-empty-icon">🏆</span>
        <h2>{t('bcg_podora_vacio_titulo')}</h2>
        <p>{t('bcg_podora_vacio_desc')}</p>
      </div>
    )
  }

  return (
    <div className="bcg-podora">
      <p className="bcg-podora-intro">{t('bcg_podora_intro')}</p>

      <div className="bcg-podora-candidatos">
        {candidatos.map((c) => {
          const pct = sliders[c.estructura_id] ?? 100
          const ahorro = c.gasto_prom_90d * (pct / 100)
          return (
            <article key={c.estructura_id} className="bcg-podora-candidato">
              <header className="bcg-podora-cand-head">
                <span
                  className="bcg-podora-cand-icon"
                  style={{ background: `${c.color}33` }}
                  aria-hidden="true"
                >
                  {c.icono}
                </span>
                <div className="bcg-podora-cand-body">
                  <strong>{c.nombre}</strong>
                  <div className="bcg-podora-cand-stats">
                    <span>Placer: <strong>{c.utilidad_placer}/10</strong></span>
                    <span>Flex: <strong>{c.flexibilidad_recorte}/10</strong></span>
                    <span className="bcg-podora-cand-mensual">{formatMoneyARS(c.gasto_prom_90d)} / mes</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onCandidatoClick(c.estructura_id)}
                >
                  {t('btn_view_detail')} →
                </button>
              </header>

              <div className="bcg-podora-cand-slider">
                <label htmlFor={`podora-${c.estructura_id}`}>
                  {t('bcg_podora_simulador_titulo')}
                </label>
                <input
                  id={`podora-${c.estructura_id}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  onChange={(e) => handleSlider(c.estructura_id, Number(e.target.value))}
                  style={{ ['--val' as any]: `${pct}%` }}
                />
                <strong className="bcg-podora-cand-pct">{pct}%</strong>
                <span className="bcg-podora-cand-ahorro">
                  {ahorro > 0 ? `−${formatMoneyARS(ahorro)} / mes` : '—'}
                </span>
              </div>
            </article>
          )
        })}
      </div>

      <section className="bcg-podora-impacto">
        <h3>{t('bcg_podora_impacto_titulo')}</h3>
        <p>{t('bcg_podora_impacto_leyenda', { count: candidatos.length })}</p>
        <div className="bcg-podora-impacto-grid">
          <div>
            <span>{t('bcg_podora_impacto_mensual', { monto: '' }).replace('Ahorras ', 'Ahorras')}</span>
            <strong>{formatMoneyARS(totalMensual)}</strong>
          </div>
          <div>
            <span>{t("bcg_per_year")}</span>
            <strong>{formatMoneyARS(totalAnual)}</strong>
          </div>
        </div>

        {equivalencia && totalAnual > 0 && (
          <div className="bcg-podora-equivalencia">
            <span>{t('bcg_podora_equivalencia_titulo')}</span>
            <strong>
              {t(equivalencia.i18nKey as any, { count: Math.max(1, Math.floor(totalAnual / equivalencia.umbral)) })}
            </strong>
          </div>
        )}

        <div className="bcg-podora-destino">
          <div className="bcg-podora-destino-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={destino === 'supervivencia'}
              className={destino === 'supervivencia' ? 'active' : ''}
              onClick={() => {
                haptics.light()
                setDestino('supervivencia')
              }}
            >
              🛡️ {t('bcg_podora_destino_supervivencia')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={destino === 'meta'}
              className={destino === 'meta' ? 'active' : ''}
              onClick={() => {
                haptics.light()
                setDestino('meta')
              }}
            >
              🎯 {t('bcg_podora_destino_meta')}
            </button>
          </div>

          {destino === 'supervivencia' ? (
            <div className="bcg-podora-impacto-detalle">
              {totalMensual > 0 ? (
                <strong>{t('bcg_podora_dias_escudo', { dias: impacto })}</strong>
              ) : (
                <span className="bcg-podora-muted">—</span>
              )}
              <small>{t('bcg_current_shield', { dias: lineaBase.escudo_dias_actual })}</small>
            </div>
          ) : tieneMetas && metaPrioritaria ? (
            <div className="bcg-podora-impacto-detalle">
              {totalMensual > 0 ? (
                <strong>{t('bcg_podora_dias_meta', { dias: impacto })}</strong>
              ) : (
                <span className="bcg-podora-muted">—</span>
              )}
              <small>{metaPrioritaria.nombre} · {formatMoneyARS(metaPrioritaria.saldo_actual)} / {formatMoneyARS(metaPrioritaria.monto_meta)}</small>
            </div>
          ) : (
            <div className="bcg-podora-impacto-detalle bcg-podora-sin-metas">
              <span>{t('bcg_podora_sin_metas')}</span>
            </div>
          )}
        </div>

        <p className="bcg-podora-decision">{t('bcg_podora_decision_tuya')}</p>

        <button
          type="button"
          className="btn btn-secondary bcg-podora-capturar"
          onClick={() => {
            haptics.success()
            try {
              const target = document.querySelector('.bcg-podora') as HTMLElement
              if (target && (window as any).html2canvas) {
                ;(window as any).html2canvas(target).then((canvas: HTMLCanvasElement) => {
                  const link = document.createElement('a')
                  link.download = `podora-bcg-${new Date().toISOString().slice(0, 10)}.png`
                  link.href = canvas.toDataURL('image/png')
                  link.click()
                })
              } else {
                showToastFallback()
              }
            } catch {
              showToastFallback()
            }
          }}
        >
          {t('bcg_podora_capturar')}
        </button>
      </section>
    </div>
  )

  function showToastFallback() {
    // Toast inline sin html2canvas: placeholder.
    alert(t('error_html2canvas_unavailable'))
  }
}

export default BCGPodora
