import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { formatMoneyARS } from '@/lib/bcgUtils'
import { BCGBuzonModal } from './BCGBuzonModal'
import './BCGHormigas.css'

export interface HormigaFE {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color: string
  frecuencia_mensual: number
  gasto_mensual_estimado: number
  impacto_anual: number
  porcentaje_del_ingreso: number
}

export interface RetoHormigasFE {
  total_hormigas_mes: number
  cantidad_hormigas: number
  comparativa: {
    mes_anterior: number
    mes_antepasado: number
    tendencia_key: 'improving' | 'worsening' | 'stable'
  }
  buzon_disponible: boolean
  buzon_id: number | null
  buzon_nombre: string | null
  buzon_saldo_actual: number | null
  proyeccion_6_meses: number
  mensaje_key: 'msg_challenge_zero_ants' | 'msg_challenge_no_piggybank' | 'msg_challenge_transfer_to_piggybank'
}

interface BCGHormigasProps {
  hormigas: HormigaFE[]
  reto: RetoHormigasFE | null
  onCategoriaClick: (estructuraId: number) => void
}

function tendenciaLabel(tk: RetoHormigasFE['comparativa']['tendencia_key'], pct: number) {
  if (tk === 'improving') return t('bcg_hormiga_tendencia_improving', { pct: Math.abs(pct) })
  if (tk === 'worsening') return t('bcg_hormiga_tendencia_worsening', { pct: Math.abs(pct) })
  return t('bcg_hormiga_tendencia_stable')
}

function maxBar(m: number, a: number, b: number): number {
  return Math.max(m, a, b, 1)
}

export function BCGHormigas({ hormigas, reto, onCategoriaClick }: BCGHormigasProps) {
  const navigate = useNavigate()
  const [showBuzonModal, setShowBuzonModal] = useState(false)

  if (!reto || (reto.cantidad_hormigas === 0 && hormigas.length === 0)) {
    return (
      <div className="bcg-hormigas-empty">
        <span className="bcg-hormigas-empty-icon">🏆</span>
        <h2>{t('bcg_hormiga_vacio')}</h2>
        <p>{t('bcg_hormiga_sin_datos')}</p>
      </div>
    )
  }

  const max = maxBar(reto.total_hormigas_mes, reto.comparativa.mes_anterior, reto.comparativa.mes_antepasado)
  const anchoActual = (reto.total_hormigas_mes / max) * 100
  const anchoAnterior = (reto.comparativa.mes_anterior / max) * 100
  const anchoAntepasado = (reto.comparativa.mes_antepasado / max) * 100

  // % de cambio vs mes anterior
  const pctCambio = reto.comparativa.mes_anterior > 0
    ? Math.round(((reto.total_hormigas_mes - reto.comparativa.mes_anterior) / reto.comparativa.mes_anterior) * 100)
    : 0

  return (
    <div className="bcg-hormigas">
      <section className="bcg-hormigas-resumen">
        <h2>{t('bcg_hormiga_resumen_titulo')}</h2>
        <div className="bcg-hormigas-grid">
          <div>
            <span>{t('bcg_hormiga_total_label')}</span>
            <strong>{formatMoneyARS(reto.total_hormigas_mes)}</strong>
          </div>
          <div>
            <span>{t('bcg_hormiga_cantidad_label')}</span>
            <strong>{reto.cantidad_hormigas}</strong>
          </div>
        </div>
      </section>

      <section className="bcg-hormigas-comparativa">
        <h2>{t('bcg_hormiga_comparativa_titulo')}</h2>
        <div className="bcg-hormigas-bars">
          <div className="bcg-hormigas-bar-row">
            <span>{t('bcg_hormiga_mes_antepasado')}</span>
            <div className="bcg-hormigas-bar-track">
              <div className="bcg-hormigas-bar-fill" style={{ width: `${anchoAntepasado}%` }} />
            </div>
            <strong>{formatMoneyARS(reto.comparativa.mes_antepasado)}</strong>
          </div>
          <div className="bcg-hormigas-bar-row">
            <span>{t('bcg_hormiga_mes_anterior')}</span>
            <div className="bcg-hormigas-bar-track">
              <div className="bcg-hormigas-bar-fill" style={{ width: `${anchoAnterior}%` }} />
            </div>
            <strong>{formatMoneyARS(reto.comparativa.mes_anterior)}</strong>
          </div>
          <div className="bcg-hormigas-bar-row bcg-hormigas-bar-actual">
            <span>{t('bcg_hormiga_mes_actual')}</span>
            <div className="bcg-hormigas-bar-track">
              <div className="bcg-hormigas-bar-fill" style={{ width: `${anchoActual}%` }} />
            </div>
            <strong>{formatMoneyARS(reto.total_hormigas_mes)}</strong>
          </div>
        </div>
        <div className={`bcg-hormigas-tendencia bcg-hormigas-tendencia-${reto.comparativa.tendencia_key}`}>
          {tendenciaLabel(reto.comparativa.tendencia_key, pctCambio)}
        </div>
      </section>

      <section className="bcg-hormigas-top">
        <h2>{t('bcg_hormiga_top_titulo')}</h2>
        {hormigas.length === 0 ? (
          <p className="bcg-muted">{t('bcg_hormiga_vacio')}</p>
        ) : (
          <ul className="bcg-hormigas-list">
            {hormigas.map((h) => (
              <li
                key={h.estructura_id}
                className="bcg-hormigas-item"
                onClick={() => {
                  haptics.light()
                  onCategoriaClick(h.estructura_id)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCategoriaClick(h.estructura_id)
                  }
                }}
              >
                <span
                  className="bcg-hormigas-item-icon"
                  style={{ background: `${h.color}33` }}
                  aria-hidden="true"
                >
                  {h.icono}
                </span>
                <div className="bcg-hormigas-item-body">
                  <strong>{h.nombre_cuenta}</strong>
                  <span>
                    {t('bcg_hormiga_frecuencia_label', { count: h.frecuencia_mensual })} ·{' '}
                    {t('bcg_hormiga_promedio_label', { monto: formatMoneyARS(h.gasto_mensual_estimado / Math.max(h.frecuencia_mensual, 1)) })}
                  </span>
                  <small>{t('bcg_hormiga_impacto_anual', { monto: formatMoneyARS(h.impacto_anual) })}</small>
                </div>
                <span className="bcg-hormigas-item-monto">{formatMoneyARS(h.gasto_mensual_estimado)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bcg-hormigas-reto">
        <h2>🎯 {t('bcg_hormiga_reto_titulo')}</h2>

        <div className="bcg-hormigas-proyeccion">
          <span>{t('bcg_hormiga_proyeccion_label')}</span>
          <strong>{formatMoneyARS(reto.proyeccion_6_meses)}</strong>
        </div>

        {reto.mensaje_key === 'msg_challenge_zero_ants' ? (
          <div className="bcg-hormigas-card bcg-hormigas-card-zero">
            <h3>{t('bcg_hormiga_estado_zero_titulo')}</h3>
            <p>{t('bcg_hormiga_estado_zero_desc')}</p>
          </div>
        ) : reto.mensaje_key === 'msg_challenge_no_piggybank' ? (
          <div className="bcg-hormigas-card bcg-hormigas-card-no-buzon">
            <h3>{t('bcg_hormiga_estado_no_buzon_titulo', { monto: formatMoneyARS(reto.total_hormigas_mes) })}</h3>
            <p>{t('bcg_hormiga_estado_no_buzon_desc')}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/presupuesto?crear_buzon=1')}
            >
              {t('bcg_hormiga_estado_no_buzon_cta')}
            </button>
          </div>
        ) : (
          <div className="bcg-hormigas-card bcg-hormigas-card-transfer">
            <h3>{t('bcg_hormiga_estado_transfer_titulo', { monto: formatMoneyARS(reto.total_hormigas_mes) })}</h3>
            <p>
              {t('bcg_hormiga_estado_transfer_desc', {
                buzon: reto.buzon_nombre ?? 'Buzón',
                saldo: formatMoneyARS(reto.buzon_saldo_actual ?? 0),
              })}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                haptics.light()
                setShowBuzonModal(true)
              }}
            >
              {t('bcg_hormiga_estado_transfer_cta')}
            </button>
          </div>
        )}
      </section>

      {showBuzonModal && reto.buzon_id && (
        <BCGBuzonModal
          isOpen={showBuzonModal}
          onClose={() => setShowBuzonModal(false)}
          onSuccess={() => {
            // Re-fetch de los datos de la página
            window.dispatchEvent(new CustomEvent('movement-added'))
          }}
          buzonId={reto.buzon_id}
          buzonNombre={reto.buzon_nombre ?? 'Buzón'}
          monto={reto.total_hormigas_mes}
        />
      )}
    </div>
  )
}

export default BCGHormigas
