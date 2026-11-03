// src/components/gastos-recurrentes/GastoRecurrenteCard.tsx
// Una tarjeta del listado. Requisitos R-GR-32 (listado), R-GR-38 (motivo de pausa),
// RN-39/RN-40 (pausar y borrar son acciones distintas).
// PRD §32.4.

import { t } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import { parseFechaAnual, type GastoRecurrenteRow } from '@/lib/gastosRecurrentes'
import { fechaVisible, nombreVisibleRecurrente } from '@/lib/gastosRecurrentes'

interface Props {
  item: GastoRecurrenteRow
  onEdit: (item: GastoRecurrenteRow) => void
  onPause: (item: GastoRecurrenteRow) => void
  onResume: (item: GastoRecurrenteRow) => void
  onDelete: (item: GastoRecurrenteRow) => void
  busy?: boolean
}

/** «días 5 y 15» / «lunes, miércoles y viernes» / «15 de marzo y 15 de agosto». */
export function describirRecurrencia(item: GastoRecurrenteRow): string {
  if (item.modo === 'semanal') {
    const dias = (item.dias_semana ?? []).map(d => t(`recurrentes_dia_${d}`))
    return dias.join(', ')
  }
  if (item.modo === 'unica') {
    // Una fecha completa, no un patron: incluye el ano.
    return item.fecha_unica
      ? t('recurrentes_unica_el', { fecha: fechaVisible(item.fecha_unica, t) })
      : t('recurrentes_sin_fechas')
  }
  if (item.modo === 'anual') {
    const fechas = (item.fechas_anio ?? [])
      .map(f => {
        const { mes, dia } = parseFechaAnual(f)
        return t('recurrentes_fecha_corta', { dia, mes: t(`recurrentes_mes_${mes}`) })
      })
    return fechas.join(' · ')
  }
  const dias = item.dias_mes ?? (item.dia_del_mes ? [item.dia_del_mes] : [])
  // Con tarjeta el día lo define el cierre de la tarjeta, no el usuario.
  if (item.tarjeta_id != null && dias.length === 0) {
    return t('recurrentes_por_cierre_tarjeta')
  }
  return t('recurrentes_dias_del_mes', { dias: dias.join(' y ') })
}

export function GastoRecurrenteCard({ item, onEdit, onPause, onResume, onDelete, busy }: Props) {
  const pausado = !item.activo
  const nombre = nombreVisibleRecurrente(item, t)
  const monto = item.monto_base != null
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(item.monto_base)
    : '—'
  const montoConMoneda = item.es_usd ? `${monto} USD` : monto

  return (
    <article className={`recur-card${pausado ? ' is-paused' : ''}`} aria-busy={busy}>
      <div className="recur-card-main">
        {/* El icono de la categoría se guarda como nombre de lucide: hay que
            resolverlo con CategoryIcon, nunca imprimir el string crudo. */}
        <span className="recur-card-icon" aria-hidden="true">
          <CategoryIcon name={item.icono ?? 'Repeat'} size={22} />
        </span>
        <div className="recur-card-text">
          <h3 className="recur-card-title">{nombre}</h3>
          <p className="recur-card-meta">
            <span className="recur-card-amount">{montoConMoneda}</span>
            <span aria-hidden="true"> · </span>
            <span>{describirRecurrencia(item)}</span>
          </p>
          {item.tarjeta_nombre ? (
            <p className="recur-card-wallet">💳 {item.tarjeta_nombre}</p>
          ) : item.billetera_nombre ? (
            <p className="recur-card-wallet">💳 {t(item.billetera_nombre)}</p>
          ) : null}
          {item.fecha_fin && (
            <p className="recur-card-wallet">📅 {t('recurrentes_hasta', { fecha: fechaVisible(item.fecha_fin, t) })}</p>
          )}
          {pausado && item.motivo_pausa && (
            <>
              <p className="recur-card-reason" role="status">
                ⚠️ {t(`recurrentes_motivo_${item.motivo_pausa}`)}
              </p>
              {/* R-GR-38: el aviso no alcanza, tiene que ofrecer la salida.
                  Abre el modal de edición; al guardar, la fila se reactiva. */}
              <button
                type="button"
                className="recur-card-cta"
                onClick={() => onEdit(item)}
                disabled={busy}
              >
                {t('recurrentes_reconfigurar')}
              </button>
            </>
          )}
          {item.ocurrencias_pendientes > 0 && (
            <p className="recur-card-pending">
              {t(item.ocurrencias_pendientes === 1 ? 'recurrentes_pendientes_one' : 'recurrentes_pendientes_other', { count: item.ocurrencias_pendientes })}
            </p>
          )}
        </div>
      </div>

      <div className="recur-card-state">
        <span className={`recur-badge${pausado ? ' is-paused' : ''}`}>
          {pausado ? t('recurrentes_estado_pausa') : t('recurrentes_estado_activo')}
        </span>
      </div>

      <div className="recur-card-actions">
        <button
          type="button"
          className="recur-action"
          onClick={() => onEdit(item)}
          aria-label={t('recurrentes_editar')}
          title={t('recurrentes_editar')}
          disabled={busy}
        >
          ✏️
        </button>

        {pausado ? (
          <button
            type="button"
            className="recur-action"
            onClick={() => onResume(item)}
            aria-label={t('recurrentes_reactivar')}
            title={t('recurrentes_reactivar')}
            disabled={busy}
          >
            ▶
          </button>
        ) : (
          <button
            type="button"
            className="recur-action"
            onClick={() => onPause(item)}
            aria-label={t('recurrentes_pausar')}
            title={t('recurrentes_pausar')}
            disabled={busy}
          >
            ⏸
          </button>
        )}

        <button
          type="button"
          className="recur-action recur-action--danger"
          onClick={() => onDelete(item)}
          aria-label={t('recurrentes_borrar')}
          title={t('recurrentes_borrar')}
          disabled={busy}
        >
          🗑
        </button>
      </div>
    </article>
  )
}
