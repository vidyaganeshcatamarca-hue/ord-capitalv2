import { useMemo, useState } from 'react'
import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import type { RadarData } from '@/pages/Supervivencia/SupervivenciaPage'
import './RadarAsfixiaDetalle.css'

interface RadarAsfixiaDetalleProps {
  radar: RadarData[]
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

const DIAS_SEMANA = [t('day_short_lu', {defaultValue:'Lu'}), t('day_short_ma', {defaultValue:'Ma'}), t('day_short_mi', {defaultValue:'Mi'}), t('day_short_ju', {defaultValue:'Ju'}), t('day_short_vi', {defaultValue:'Vi'}), t('day_short_sa', {defaultValue:'Sá'}), t('day_short_do', {defaultValue:'Do'})]
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function RadarAsfixiaDetalle({ radar }: RadarAsfixiaDetalleProps) {
  const [diaSeleccionado, setDiaSeleccionado] = useState<RadarData | null>(null)

  const diasCriticos = useMemo(
    () => radar.filter((r) => r.estado_dia === 'red'),
    [radar],
  )

  const mesActual = useMemo(() => {
    if (radar.length === 0) return ''
    const primerDia = new Date(radar[0].dia)
    return `${MESES_CORTOS[primerDia.getMonth()]} ${primerDia.getFullYear()}`
  }, [radar])

  if (radar.length === 0) {
    return (
      <section className="radar-detalle">
        <p className="radar-vacio">{t('war_radar_sin_billeteras')}</p>
      </section>
    )
  }

  const handleClickDia = (dia: RadarData) => {
    haptics.light()
    setDiaSeleccionado(dia)
  }

  return (
    <section className="radar-detalle">
      <header className="radar-detalle-header">
        <span className="radar-detalle-kicker">{t('war_radar_detalle_kicker')}</span>
        <h2 className="font-display">{t('war_radar_detalle_pagina_titulo')}</h2>
        <p className="radar-detalle-periodo">{mesActual}</p>
      </header>

      <div className="radar-heatmap" role="grid" aria-label={t("radar_heatmap_aria")}>
        <div className="radar-heatmap-dow">
          {DIAS_SEMANA.map((d) => (
            <span key={d} className="radar-heatmap-dow-cell">{d}</span>
          ))}
        </div>
        <div className="radar-heatmap-grid">
          {radar.map((dia) => {
            const date = new Date(dia.dia)
            const dayNum = date.getDate()
            const isFirstOfMonth = dayNum === 1
            return (
              <button
                key={dia.dia}
                type="button"
                className={`radar-cell radar-cell-${dia.estado_dia} ${diaSeleccionado?.dia === dia.dia ? 'seleccionado' : ''}`}
                onClick={() => handleClickDia(dia)}
                title={`${dayNum} - Saldo: ${formatMoneyARS(dia.saldo_proyectado)}`}
              >
                <span className="radar-cell-num">{dayNum}</span>
                {dia.ingreso_esperado > 0 && <span className="radar-cell-icon radar-icon-ingreso">💰</span>}
                {dia.egreso_tarjeta > 0 && <span className="radar-cell-icon radar-icon-tarjeta">💳</span>}
                {isFirstOfMonth && (
                  <span className="radar-cell-mes">{MESES_CORTOS[date.getMonth()]}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="radar-leyenda">
        <h3>{t('war_radar_detalle_leyenda_titulo')}</h3>
        <div className="radar-leyenda-grid">
          <div className="radar-leyenda-item">
            <span className="radar-leyenda-swatch radar-cell-green" />
            <span>{t('war_radar_leyenda_verde')}</span>
          </div>
          <div className="radar-leyenda-item">
            <span className="radar-leyenda-swatch radar-cell-yellow" />
            <span>{t('war_radar_leyenda_amarillo')}</span>
          </div>
          <div className="radar-leyenda-item">
            <span className="radar-leyenda-swatch radar-cell-red" />
            <span>{t('war_radar_leyenda_rojo')}</span>
          </div>
          <div className="radar-leyenda-item">
            <span className="radar-leyenda-icon">💰</span>
            <span>{t('war_radar_leyenda_ingreso')}</span>
          </div>
          <div className="radar-leyenda-item">
            <span className="radar-leyenda-icon">💳</span>
            <span>{t('war_radar_leyenda_tarjeta')}</span>
          </div>
        </div>
      </div>

      {diaSeleccionado && (
        <div className="radar-detalle-overlay" onClick={() => setDiaSeleccionado(null)}>
          <div className="radar-detalle-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="radar-detalle-close" onClick={() => setDiaSeleccionado(null)}>×</button>
            <h3>{t('war_radar_detalle_titulo')}</h3>
            <p className="radar-detalle-fecha">
              {new Date(diaSeleccionado.dia).toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <div className="radar-detalle-saldo">
              <span>{t('war_radar_detalle_saldo')}</span>
              <strong className={diaSeleccionado.saldo_proyectado < 0 ? 'negativo' : 'positivo'}>
                {formatMoneyARS(diaSeleccionado.saldo_proyectado)}
              </strong>
            </div>
            {diaSeleccionado.ingreso_esperado > 0 && (
              <div className="radar-detalle-row">
                <span>💰 Ingreso esperado</span>
                <strong>{formatMoneyARS(diaSeleccionado.ingreso_esperado)}</strong>
              </div>
            )}
            {diaSeleccionado.egreso_tarjeta > 0 && (
              <div className="radar-detalle-row">
                <span>💳 Vencimiento tarjeta</span>
                <strong>{formatMoneyARS(diaSeleccionado.egreso_tarjeta)}</strong>
              </div>
            )}
            <div className="radar-detalle-row">
              <span>🔥 Gasto diario supervivencia</span>
              <strong>{formatMoneyARS(diaSeleccionado.egreso_goteo)}</strong>
            </div>
          </div>
        </div>
      )}

      <section className="radar-criticos-lista">
        <h3>{t('war_radar_detalle_criticos_titulo')}</h3>
        {diasCriticos.length === 0 ? (
          <p className="radar-criticos-ok">{t('war_radar_detalle_sin_criticos')}</p>
        ) : (
          <ul>
            {diasCriticos.slice(0, 5).map((dia) => (
              <li
                key={dia.dia}
                className="radar-critico-item"
                onClick={() => handleClickDia(dia)}
              >
                <span className="radar-critico-fecha">
                  {new Date(dia.dia).toLocaleDateString('es-AR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="radar-critico-saldo">{formatMoneyARS(dia.saldo_proyectado)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
