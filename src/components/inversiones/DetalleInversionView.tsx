import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatCurrencyNumber, formatDate, formatPercent } from '@/lib/format'
import { formatInversionDetalle } from '@/lib/inversionesLabels'
import { PageBackButton } from '@/components/PageBackButton/PageBackButton'
import { Trash2 } from 'lucide-react'
import { investmentMovementAmount } from '@/lib/inversionesMovimientos'
import { investmentNetCapital } from '@/lib/inversionesPatrimonio'
import './DetalleInversionView.css'
import { useFormatRevision } from '@/hooks/useFormatRevision'

export interface HistorialItem {
  fecha: string | null
  detalle: string | null
  monto: number | null
}

export interface DetalleInversion {
  inversion_id: number
  nombre_activo: string | null
  tipo_activo: 'plazo_fijo' | 'variable' | string
  monto_invertido_original: number | null
  valor_actual_teorico: number | null
  valor_mercado_actual: number | null
  tasa_anual_tna: number | null
  moneda: string | null
  ultima_conciliacion: string | null
  dias_desde_conciliacion: number | null
  estado_semaforo_key: 'green' | 'yellow' | 'red' | string
  estado_inversion: string | null
  rendimiento_nominal: number | null
  rendimiento_real: number | null
  /** S16: lo ya retirado en rescates parciales. Un retiro no es una perdida. */
  monto_liquidado?: number | null
  /** S1: null = posicion cargada como preexistente (sin egreso de billetera). */
  billetera_origen_id?: number | null
  /** B3b: false cuando la fuente esta desactivada (no es "falta configurar"). */
  inflacion_disponible?: boolean
  fuente_inflacion?: string | null
  /** S12: por que no hay inflacion, para no pedir "configurar" cuando lo que
   *  falta es el dato de cotizaciones. */
  motivo_inflacion?: 'ok' | 'desactivado' | 'sin_datos' | 'manual_sin_valor'
  historial: HistorialItem[] | null
}

interface DetalleInversionViewProps {
  inversionId: number
  onBack: () => void
  onUpdateValue: (id: number) => void
  onAddCapital?: (id: number) => void
  onLiquidate: (id: number) => void
  /// Se llama despues de borrar una posicion preexistente. La lista tiene que
  /// recargarse y volver al panel: la fila ya no existe.
  onDeleted?: () => void
}

function badgeClassFor(tipo: string): string {
  if (tipo === 'plazo_fijo') return 'detalle-badge detalle-badge--pf'
  if (tipo === 'variable') return 'detalle-badge detalle-badge--var'
  return 'detalle-badge detalle-badge--other'
}

function typeTranslationKey(tipo: string): string {
  if (tipo === 'plazo_fijo' || tipo === 'variable') return `type_${tipo}`
  return 'type_otro'
}

function semaforoLabelKey(key: string): string {
  if (key === 'green') return 'badge_semaforo_green'
  if (key === 'yellow') return 'badge_semaforo_yellow'
  if (key === 'red') return 'badge_semaforo_red'
  return 'badge_semaforo_green'
}

function yieldClassFor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'detalle-yield detalle-yield--na'
  }
  if (value > 0) return 'detalle-yield detalle-yield--positive'
  if (value < 0) return 'detalle-yield detalle-yield--negative'
  return 'detalle-yield detalle-yield--zero'
}

function movementClassFor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'detalle-history-amount detalle-history-amount--zero'
  }
  if (value > 0) return 'detalle-history-amount detalle-history-amount--positive'
  if (value < 0) return 'detalle-history-amount detalle-history-amount--negative'
  return 'detalle-history-amount detalle-history-amount--zero'
}

export function DetalleInversionView({
  inversionId,
  onBack,
  onUpdateValue,
  onAddCapital,
  onLiquidate,
  onDeleted,
}: DetalleInversionViewProps) {
  // Formato por moneda: se re-renderiza cuando cambia el contexto.
  useFormatRevision()
  const { showToast } = useToast()
  const [data, setData] = useState<DetalleInversion | null>(null)
  const [loading, setLoading] = useState(true)
  // S7: una posicion preexistente no tiene movimiento que borrar, asi que el
  // borrado se confirma aca y lo ejecuta fn_eliminar_inversion.
  const [confirmBorrar, setConfirmBorrar] = useState(false)
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadDetalle() {
      setLoading(true)
      try {
        const res = await rpc<DetalleInversion>('fn_reporte_detalle_inversion', {
          p_inversion_id: inversionId,
        })
        if (!cancelled) {
          setData(res)
        }
      } catch (err) {
        if (!cancelled) {
          const message = parseError(err) || t('error_generic')
          showToast(message, 'error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDetalle()

    return () => {
      cancelled = true
    }
  }, [inversionId, showToast])

  const handleDelete = async () => {
    if (!data || borrando) return
    setBorrando(true)
    try {
      await rpc('fn_eliminar_inversion', { p_inversion_id: data.inversion_id })
      showToast(t('msg_investment_deleted'), 'success')
      onDeleted?.()
    } catch (err) {
      showToast(parseError(err) || t('error_generic'), 'error')
    } finally {
      setBorrando(false)
      setConfirmBorrar(false)
    }
  }

  if (loading) {
    return (
      <div className="detalle-view detalle-view--loading" aria-busy="true">
        <div className="detalle-spinner" aria-hidden="true" />
        <p className="detalle-loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="detalle-view detalle-view--error">
        <p className="detalle-error-text">{t('error_generic')}</p>
        <PageBackButton
          variant="plain"
          className="detalle-back-btn"
          onBack={onBack}
          ariaLabel={t('detail_back')}
        >
          {t('detail_back')}
        </PageBackButton>
      </div>
    )
  }

  const nombre = data.nombre_activo || t('msg_no_investments')
  const typeKey = typeTranslationKey(data.tipo_activo)
  const typeLabel = t(typeKey)
  const badgeClass = badgeClassFor(data.tipo_activo)
  const semaforoLabel = t(semaforoLabelKey(data.estado_semaforo_key))
  const moneda = data.moneda || 'ARS'
  const historial = data.historial || []
  // S16: plata que ya volvio al usuario por rescates parciales. El nominal del
  // backend ya la suma, pero la UI tiene que decirlo o el numero no se entiende.
  const retirado = Number(data.monto_liquidado ?? 0)
  // S5 (ronda 6, dueño): "aparece el original capital, pero no aparecen los datos que
  // hemos modificado que me digan los retiros o el agregado de capital [...] es el mismo
  // arreglo que hicimos antes en la pantalla general". El capital guardado YA incluye los
  // aportes, así que la cifra grande es el capital neto (capital − retiros) y debajo van
  // los movimientos que explican la diferencia. Salen del mismo historial que ya trae el
  // RPC: una fuente sola, sin inventar campos.
  const capitalNeto = investmentNetCapital(data)
  // S8 (ronda 7, dueño): el borrado sale del pie de acciones y pasa al lado del
  // nombre. Solo aplica a las posiciones que fn_eliminar_inversion acepta: sin
  // billetera de origen y sin movimientos. La condicion se calcula UNA vez
  // porque la usan el boton del header y su confirmacion.
  const puedeBorrar = data.billetera_origen_id === null && historial.length === 0
  const movimientosCapital = historial.filter((mov) => typeof mov.detalle === 'string')
  const aportesCapital = movimientosCapital
    .filter((mov) => (mov.detalle as string).startsWith('investment_contribution:'))
    .map((mov) => ({ fecha: mov.fecha, monto: Math.abs(Number(mov.monto ?? 0)) }))
  const retirosCapital = movimientosCapital
    .filter((mov) => (mov.detalle as string).startsWith('rescate_inversion:'))
    .map((mov) => ({ fecha: mov.fecha, monto: Math.abs(Number(mov.monto ?? 0)) }))

  return (
    <div className="detalle-view">
      <header className="detalle-header">
        <PageBackButton
          variant="plain"
          className="detalle-back-btn detalle-back-btn--icon"
          onBack={onBack}
          ariaLabel={t('detail_back')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </PageBackButton>

        <div className="detalle-header-text">
          <h2 className="detalle-title">{nombre}</h2>
          <span className={badgeClass}>{typeLabel}</span>
        </div>

        {/* S8 (ronda 7, dueño): "con el tachito de basura solamente al lado del
            nombre de la inversión [...] bien a la derecha en la misma línea. Sin
            ningún nombre, solo el tachito de basura". Es un boton de icono: el
            nombre accesible va en aria-label, no en pantalla. */}
        {puedeBorrar && (
          <button
            type="button"
            className="detalle-header-delete"
            onClick={() => setConfirmBorrar(true)}
            disabled={borrando}
            aria-label={t('btn_delete_investment')}
            title={t('btn_delete_investment')}
            data-testid="detalle-borrar-trigger"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="detalle-meta">
        <span
          className="detalle-semaforo-dot"
          aria-hidden="true"
          data-semaforo={data.estado_semaforo_key}
        />
        <span className="detalle-semaforo-label">{semaforoLabel}</span>
        {data.dias_desde_conciliacion !== null && (
          <span className="detalle-semaforo-days">
            {data.dias_desde_conciliacion} {t('days_since_conciliation')}
          </span>
        )}
      </div>

      <section className="detalle-metrics" aria-label={t('label_current_value')}>
        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_capital')}</span>
          <span className="detalle-metric-value">
            {formatCurrency(capitalNeto ?? data.monto_invertido_original, moneda)}
          </span>
          {retirado > 0 && (
            <span className="detalle-metric-note">
              {t('label_capital_breakdown', {
                initial: formatCurrencyNumber(data.monto_invertido_original, moneda),
                withdrawn: formatCurrencyNumber(retirado, moneda),
              })}
            </span>
          )}
          {/* Los aportes nunca están en el paréntesis, así que se listan siempre. Los
              retiros sólo cuando hay más de uno: con uno solo, el paréntesis ya lo dice
              (misma regla que la tarjeta, para no repetir el número dos veces). */}
          {(aportesCapital.length > 0 || retirosCapital.length > 1) && (
            <ul className="detalle-capital-movimientos">
              {aportesCapital.map((mov, idx) => (
                <li
                  key={`aporte-${mov.fecha ?? 's-f'}-${idx}`}
                  className="detalle-capital-movimiento detalle-capital-movimiento--aporte"
                >
                  +{formatCurrencyNumber(mov.monto, moneda)}
                </li>
              ))}
              {retirosCapital.length > 1 &&
                retirosCapital.map((mov, idx) => (
                  <li
                    key={`retiro-${mov.fecha ?? 's-f'}-${idx}`}
                    className="detalle-capital-movimiento detalle-capital-movimiento--retiro"
                  >
                    −{formatCurrencyNumber(mov.monto, moneda)}
                  </li>
                ))}
            </ul>
          )}
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_current_value')}</span>
          <span className="detalle-metric-value">
            {formatCurrency(data.valor_actual_teorico, moneda)}
          </span>
          {/* S16: si hubo rescates parciales se dice explicitamente. Sin esta
              linea, el "valor actual" mas bajo que el capital original se lee
              como una perdida, cuando en realidad parte ya se retiro. */}
          {retirado > 0 && (
            <span className="detalle-metric-note">
              {t('label_partial_withdrawal_note', { amount: formatCurrency(retirado, moneda) })}
            </span>
          )}
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_nominal_yield')}</span>
          <span className={yieldClassFor(data.rendimiento_nominal)}>
            {formatPercent(data.rendimiento_nominal)}
          </span>
        </article>

        <article className="detalle-metric-card">
          <span className="detalle-metric-label">{t('label_real_yield')}</span>
          {data.rendimiento_real === null || data.rendimiento_real === undefined ? (
            // B3b: si el usuario desactivo la inflacion a proposito, el valor
            // real no existe (no es que falte configurarlo): se dice eso.
            data.fuente_inflacion === 'desactivado' ? (
              <span className="detalle-yield detalle-yield--na detalle-metric-helper">
                {t('msg_inflation_disabled')}
              </span>
            ) : data.motivo_inflacion === 'manual_sin_valor' ? (
              <span className="detalle-yield detalle-yield--na detalle-metric-helper">
                {t('msg_configure_inflation')}
              </span>
            ) : (
              // S12: ya esta configurado en proxy dolar (el default); si no hay
              // numero es porque todavia no hay cotizaciones, no porque falte
              // configurar nada.
              <span className="detalle-yield detalle-yield--na detalle-metric-helper">
                {t('msg_inflation_no_data')}
              </span>
            )
          ) : (
            <span className={yieldClassFor(data.rendimiento_real)}>
              {formatPercent(data.rendimiento_real)}
            </span>
          )}
        </article>
      </section>

      <section className="detalle-extras">
        <div className="detalle-extra-row">
          <span className="detalle-extra-label">{t('label_last_conciliation')}</span>
          <span className="detalle-extra-value">{formatDate(data.ultima_conciliacion)}</span>
        </div>
        {data.tasa_anual_tna !== null && data.tasa_anual_tna > 0 && (
          <div className="detalle-extra-row">
            <span className="detalle-extra-label">{t('label_tna')}</span>
            <span className="detalle-extra-value">
              {formatPercent(data.tasa_anual_tna, { signed: false })}
            </span>
          </div>
        )}
        <div className="detalle-extra-row">
          <span className="detalle-extra-label">{t('label_currency')}</span>
          <span className="detalle-extra-value">{moneda}</span>
        </div>
      </section>

      <section className="detalle-history">
        <h3 className="detalle-history-title">{t('detail_history_title')}</h3>
        {historial.length === 0 ? (
          <p className="detalle-history-empty">{t('detail_history_empty')}</p>
        ) : (
          <ul className="detalle-history-list">
            {historial.map((mov, idx) => {
              // El RPC trae el monto con la perspectiva de la caja; acá se lee
              // desde la inversión: aportes en verde con `+`, rescates en rojo.
              const monto = investmentMovementAmount(mov.monto)
              return (
                <li key={`${mov.fecha ?? 'mov'}-${idx}`} className="detalle-history-item">
                  <div className="detalle-history-meta">
                    <span className="detalle-history-date">
                      {formatDate(mov.fecha)}
                    </span>
                    <span className="detalle-history-detalle">
                      {mov.detalle
                        ? formatInversionDetalle(mov.detalle, (key) => t(key))
                        : t('detail_movement_label')}
                    </span>
                  </div>
                  <span
                    className={movementClassFor(monto)}
                    aria-label={t('detail_movement_monto_label')}
                  >
                    {monto !== null && monto > 0
                      ? `+${formatCurrency(monto, moneda)}`
                      : formatCurrency(monto, moneda)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="detalle-actions">
        <button
          type="button"
          className="detalle-action-btn detalle-action-btn--update"
          onClick={() => onUpdateValue(data.inversion_id)}
        >
          <span aria-hidden="true">📊</span>
          <span>{t('btn_update_value')}</span>
        </button>
        {onAddCapital && (
          <button
            type="button"
            className="detalle-action-btn detalle-action-btn--add"
            onClick={() => onAddCapital(data.inversion_id)}
          >
            <span aria-hidden="true">➕</span>
            <span>{t('btn_add_capital')}</span>
          </button>
        )}
        <button
          type="button"
          className="detalle-action-btn detalle-action-btn--liquidate"
          onClick={() => onLiquidate(data.inversion_id)}
        >
          <span aria-hidden="true">💸</span>
          <span>{t('btn_liquidate')}</span>
        </button>
        {/* S7: solo para posiciones sin billetera y sin movimientos, que es
            exactamente la condicion que verifica fn_eliminar_inversion. Las que
            tienen egreso, aporte o rescate se borran desde Historial, donde cada
            movimiento revierte su operacion.
            S8 (ronda 7): el boton que la dispara vive ahora en el header, junto
            al nombre. Acá queda solo la confirmación, para no dejar la accion
            destructiva sin segundo paso. */}
        {puedeBorrar && confirmBorrar && (
          <div className="detalle-delete-confirm" data-testid="detalle-borrar-confirmacion">
            <p>{t('confirm_delete_investment')}</p>
            <div className="detalle-delete-confirm-actions">
              <button
                type="button"
                className="detalle-action-btn detalle-action-btn--add"
                onClick={() => setConfirmBorrar(false)}
                disabled={borrando}
              >
                <span>{t('btn_cancel')}</span>
              </button>
              <button
                type="button"
                className="detalle-action-btn detalle-action-btn--liquidate"
                onClick={handleDelete}
                disabled={borrando}
              >
                <span>{borrando ? t('loading') : t('btn_delete_investment')}</span>
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}

export default DetalleInversionView
