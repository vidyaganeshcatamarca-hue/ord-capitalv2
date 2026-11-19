import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { haptics } from '@/lib/haptics'
import { numero, estadoKey, estadoTono, modalidadKey, type Direccion, type PrestamoDetalle, type PrestamoPagoTarget } from './types'
import { fechaOTexto, montoONoCalculable, tasaTexto, textoEstadoVencimiento } from './formato'
import './prestamos.css'

interface PrestamoDetalleViewProps {
  prestamoId: number
  direccion: Direccion
  onVolver: () => void
  onRegistrar: (target: PrestamoPagoTarget) => void
  /** Re-reads the detail after a payment landed. */
  recargarToken: number
}

/**
 * Read-only detail of one loan: its schedule and its recorded payments.
 * `estado_vencimiento` is the backend's verdict, shown as it arrives.
 */
export function PrestamoDetalleView({
  prestamoId,
  direccion,
  onVolver,
  onRegistrar,
  recargarToken,
}: PrestamoDetalleViewProps) {
  // El formato de moneda/porcentaje llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()
  const [detalle, setDetalle] = useState<PrestamoDetalle | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await rpc<PrestamoDetalle>('fn_prestamo_detalle', { p_prestamo_id: prestamoId })
      setDetalle(data ?? null)
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setCargando(false)
    }
  }, [prestamoId, showToast])

  useEffect(() => {
    void cargar()
  }, [cargar, recargarToken])

  if (cargando && !detalle) {
    return (
      <div className="prestamos-loading-mini">
        <div className="spinner" />
        <p className="prestamos-hint">{t('prestamos_detalle_cargando')}</p>
      </div>
    )
  }

  if (!detalle) {
    return (
      <div className="prestamos-empty">
        <p>{t('error_generic')}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void cargar()}>
          {t('prestamos_retry')}
        </button>
      </div>
    )
  }

  const cuotas = detalle.cuotas ?? []
  const pagos = detalle.pagos ?? []
  const claveEstado = estadoKey(detalle.estado_vencimiento)
  const claveModalidad = modalidadKey(detalle.modalidad)
  const excedente = numero(detalle.total_interes_excedente)
  const puedeRegistrar = detalle.estado_vencimiento !== 'saldado'

  return (
    <section className="prestamos-detalle">
      <button type="button" className="prestamos-back" onClick={onVolver}>
        {t('prestamos_volver')}
      </button>

      <header className="prestamos-detalle-header">
        <div>
          <h2 className="font-display">{detalle.nombre}</h2>
          <p className="prestamos-hint">{detalle.contraparte}</p>
        </div>
        <span className={`prestamos-badge ${estadoTono(detalle.estado_vencimiento)}`}>
          {textoEstadoVencimiento(detalle.estado_vencimiento, claveEstado)}
        </span>
      </header>

      <div className="prestamos-saldos">
        <div className="prestamos-saldo-block">
          <span className="prestamos-saldo-label">{t('prestamos_lista_saldo')}</span>
          <strong className="prestamos-saldo-valor">
            {montoONoCalculable(detalle.saldo_pendiente, detalle.moneda)}
          </strong>
        </div>
        <div className="prestamos-saldo-block">
          <span className="prestamos-saldo-label">{t('prestamos_lista_original')}</span>
          <span>{montoONoCalculable(detalle.monto_original, detalle.moneda)}</span>
        </div>
        <div className="prestamos-saldo-block">
          <span className="prestamos-saldo-label">{t('prestamos_lista_pagado')}</span>
          <span>{montoONoCalculable(detalle.pagado_registrado, detalle.moneda)}</span>
        </div>
        <div className="prestamos-saldo-block">
          <span className="prestamos-saldo-label">{t('prestamos_lista_tasa')}</span>
          <span>{tasaTexto(detalle.tasa, detalle.tasa_informada)}</span>
        </div>
        <div className="prestamos-saldo-block">
          <span className="prestamos-saldo-label">{t('prestamos_lista_vencimiento')}</span>
          <span>{fechaOTexto(detalle.proximo_vencimiento, 'prestamos_lista_sin_vencimiento')}</span>
        </div>
        {claveModalidad && (
          <div className="prestamos-saldo-block">
            <span className="prestamos-saldo-label">{t(claveModalidad)}</span>
          </div>
        )}
      </div>

      {excedente !== null && excedente > 0 && (
        <p className="prestamos-nota">
          {t('prestamos_detalle_interes_excedente')}: {montoONoCalculable(excedente, detalle.moneda)}
        </p>
      )}

      {puedeRegistrar && (
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={() => {
            haptics.light()
            // El objetivo sale del propio detalle: si el préstamo no está en la lista
            // visible (por ejemplo, un saldado excluido por el filtro), se puede
            // registrar igual porque estos datos son los de la RPC de detalle.
            onRegistrar({
              prestamo_id: detalle.prestamo_id,
              nombre: detalle.nombre,
              moneda: detalle.moneda,
              saldo_pendiente: detalle.saldo_pendiente,
              direccion: detalle.direccion,
            })
          }}
        >
          {t(direccion === 'me_deben' ? 'prestamos_lista_registrar_cobro' : 'prestamos_lista_registrar_pago')}
        </button>
      )}

      <h3 className="prestamos-subtitulo">{t('prestamos_detalle_cuotas')}</h3>
      {cuotas.length === 0 ? (
        <p className="prestamos-hint">{t('prestamos_detalle_sin_cuotas')}</p>
      ) : (
        <ul className="prestamos-cuotas">
          {cuotas.map((cuota) => (
            <li key={cuota.cuota_id} className="prestamos-cuota-row">
              <span className="prestamos-cuota-num">
                {t('prestamos_detalle_cuota', { n: cuota.numero_cuota })}
              </span>
              <span className="prestamos-cuota-monto">
                {montoONoCalculable(cuota.monto_cuota, detalle.moneda)}
              </span>
              <span className="prestamos-cuota-fecha">{fechaOTexto(cuota.fecha_vencimiento, '-')}</span>
              {cuota.vencida && (
                <span className="prestamos-badge is-vencido">{t('prestamos_detalle_vencida')}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="prestamos-subtitulo">{t('prestamos_detalle_pagos')}</h3>
      {pagos.length === 0 ? (
        <p className="prestamos-hint">{t('prestamos_detalle_sin_pagos')}</p>
      ) : (
        <ul className="prestamos-pagos">
          {pagos.map((pago) => (
            <li key={pago.pago_id} className="prestamos-pago-row">
              <div className="prestamos-pago-linea">
                <span>{fechaOTexto(pago.fecha, '-')}</span>
                <span className="prestamos-pago-monto">
                  {montoONoCalculable(pago.monto_billetera, pago.moneda_billetera ?? detalle.moneda)}
                </span>
              </div>
              <div className="prestamos-pago-meta">
                <span>
                  {t('prestamos_detalle_entrega')}:{' '}
                  {montoONoCalculable(pago.monto_billetera, pago.moneda_billetera ?? detalle.moneda)}
                </span>
                <span>
                  {t('prestamos_detalle_aplicado')}: {montoONoCalculable(pago.monto_aplicado, detalle.moneda)}
                </span>
                {numero(pago.interes_excedente) !== null && (
                  <span>
                    {t('prestamos_detalle_interes_excedente')}:{' '}
                    {montoONoCalculable(pago.interes_excedente, detalle.moneda)}
                  </span>
                )}
                {pago.nota && (
                  <span>
                    {t('prestamos_detalle_nota')}: {pago.nota}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
