import { formatCurrency, formatDate, formatPercent } from '@/lib/format'
import { t } from '@/locales/i18n'
import { ChevronLeft } from 'lucide-react'
import type { Sobre, SobreDetalle } from './types'
import './SobreDetail.css'

interface SobreDetailProps {
  detalle: SobreDetalle
  onBack: () => void
  onProvision: (sobre: Sobre) => void
  onRescue: (sobre: Sobre) => void
  onEdit: (sobre: Sobre) => void
}

const ETIQUETA_TIPO: Record<string, string> = {
  aporte: 'sobres_history_aporte',
  rescate: 'sobres_history_rescate',
  rendimiento: 'sobres_history_rendimiento',
}

/** Convierte el detalle de la RPC al shape que espera la tarjeta/acciones. */
export function sobreDesdeDetalle(detalle: SobreDetalle): Sobre {
  return {
    sobre_id: detalle.sobre.sobre_id,
    nombre: detalle.sobre.nombre,
    moneda: detalle.sobre.moneda,
    saldo: detalle.plan.saldo,
    monto_meta: detalle.sobre.monto_meta,
    fecha_objetivo: detalle.sobre.fecha_objetivo,
    plan_inicio_at: detalle.sobre.plan_inicio_at,
    porcentaje_progreso: detalle.plan.porcentaje_progreso,
    monto_faltante: detalle.plan.monto_faltante,
    dias_restantes: detalle.plan.dias_restantes,
    estado_key: detalle.plan.estado_key,
    cuota_mensual: detalle.plan.cuota_mensual,
    cuota_quincenal: detalle.plan.cuota_quincenal,
    cuota_semanal: detalle.plan.cuota_semanal,
    orden: detalle.sobre.orden,
    orden_manual: detalle.sobre.orden_manual,
    archivado_at: detalle.sobre.archivado_at,
    tiene_rendimiento: detalle.porciones.some((p) => p.genera_rendimiento && p.saldo > 0),
  }
}

export function SobreDetail({ detalle, onBack, onProvision, onRescue, onEdit }: SobreDetailProps) {
  const { sobre, plan, porciones, historial } = detalle
  const tieneMeta = sobre.monto_meta !== null && sobre.monto_meta > 0
  const tieneFecha = sobre.fecha_objetivo !== null
  const cuotaDisponible = plan.cuota_mensual !== null && plan.cuota_mensual > 0
  const archivado = sobre.archivado_at !== null

  return (
    <section className="sobre-detalle" aria-labelledby="sobre-detalle-titulo">
      <button type="button" className="sobre-detalle-volver" onClick={onBack}>
        <ChevronLeft size={18} />
        {t('btn_back')}
      </button>

      <header className="sobre-detalle-header">
        <div>
          <p className="sobre-detalle-kicker">{t('sobres_detail')}</p>
          <h2 id="sobre-detalle-titulo">{sobre.nombre}</h2>
          <span className={`sobre-estado sobre-estado--${plan.estado_key.replace('state_', '')}`}>
            {t(plan.estado_key)}
          </span>
        </div>
        {!archivado && (
          <button type="button" className="btn btn-secondary" onClick={() => onEdit(sobreDesdeDetalle(detalle))}>
            {t('sobres_edit')}
          </button>
        )}
      </header>

      <div className="sobre-detalle-metricas">
        <article>
          <span>{t('sobres_current_balance')}</span>
          <strong>{formatCurrency(plan.saldo, sobre.moneda)}</strong>
        </article>
        {tieneMeta && (
          <>
            <article>
              <span>{t('sobres_goal_amount')}</span>
              <strong>{formatCurrency(sobre.monto_meta, sobre.moneda)}</strong>
            </article>
            <article>
              <span>{t('sobres_missing_amount')}</span>
              <strong>{formatCurrency(plan.monto_faltante ?? 0, sobre.moneda)}</strong>
            </article>
          </>
        )}
      </div>

      {tieneMeta && (
        <div className="sobre-detalle-progreso">
          <div className="sobre-detalle-barra" aria-hidden="true">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, Number(plan.porcentaje_progreso ?? 0)))}%`,
              }}
            />
          </div>
          <span className="sobre-detalle-porcentaje">
            {formatPercent(plan.porcentaje_progreso ?? 0, { decimals: 0, signed: false })}
          </span>
        </div>
      )}

      {(tieneFecha || cuotaDisponible) && (
        <article className="sobre-detalle-plan">
          {tieneFecha && (
            <div>
              <span>{t('sobres_target_date')}</span>
              <strong>{formatDate(sobre.fecha_objetivo)}</strong>
              {plan.dias_restantes !== null && (
                <small>
                  {plan.dias_restantes < 0
                    ? t('sobres_goal_overdue')
                    : plan.dias_restantes === 0
                      ? t('sobres_due_today')
                      : t('sobres_days_left', { dias: plan.dias_restantes })}
                </small>
              )}
            </div>
          )}
          {cuotaDisponible && (
            <div>
              <span>{t('sobres_quota_monthly')}</span>
              <strong>{formatCurrency(plan.cuota_mensual, sobre.moneda)}</strong>
              <small>
                {t('sobres_quota_equivalences')}: {t('sobres_quota_fortnightly')}{' '}
                {formatCurrency(plan.cuota_quincenal, sobre.moneda)} · {t('sobres_quota_weekly')}{' '}
                {formatCurrency(plan.cuota_semanal, sobre.moneda)}
              </small>
            </div>
          )}
        </article>
      )}

      {porciones.length > 0 && (
        <section className="sobre-detalle-seccion">
          <h3>{t('sobres_porciones_title')}</h3>
          <ul className="sobre-detalle-porciones">
            {porciones.map((porcion) => (
              <li key={`${porcion.billetera_id}_${porcion.modalidad}`}>
                <div>
                  <strong>{porcion.billetera_nombre}</strong>
                  <span className={`sobre-porcion-modalidad sobre-porcion-modalidad--${porcion.modalidad}`}>
                    {t(
                      porcion.modalidad === 'real'
                        ? 'sobres_modality_real_short'
                        : 'sobres_modality_virtual_short',
                    )}
                  </span>
                </div>
                <span>{formatCurrency(porcion.saldo, porcion.moneda)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sobre-detalle-seccion">
        <h3>{t('sobres_history_title')}</h3>
        {historial.length === 0 ? (
          <p className="sobre-detalle-vacio">{t('sobres_history_empty')}</p>
        ) : (
          <ul className="sobre-detalle-historial">
            {historial.map((movimiento) => (
              <li key={movimiento.movimiento_id}>
                <div>
                  <strong>{t(ETIQUETA_TIPO[movimiento.tipo] ?? movimiento.tipo)}</strong>
                  <small>
                    {formatDate(movimiento.fecha)} · {movimiento.billetera_nombre}
                  </small>
                </div>
                <span className={movimiento.tipo === 'rescate' ? 'sobre-detalle-negativo' : 'sobre-detalle-positivo'}>
                  {movimiento.tipo === 'rescate' ? '−' : '+'}
                  {formatCurrency(movimiento.importe, sobre.moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!archivado && (
        <div className="sobre-detalle-acciones">
          <button type="button" className="btn btn-primary" onClick={() => onProvision(sobreDesdeDetalle(detalle))}>
            {t('sobres_provision')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onRescue(sobreDesdeDetalle(detalle))}>
            {t('sobres_rescue')}
          </button>
        </div>
      )}
    </section>
  )
}

export default SobreDetail
