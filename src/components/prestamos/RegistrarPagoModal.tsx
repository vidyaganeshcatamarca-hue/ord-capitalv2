import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { fechaLocalISO, formatCurrency } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { numero, type PrestamoPago, type PrestamoPagoTarget } from './types'
import { montoONoCalculable } from './formato'
import './prestamos.css'

interface BilleteraOption {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number | null
}

interface RegistrarPagoModalProps {
  isOpen: boolean
  target: PrestamoPagoTarget
  /**
   * When present the modal corrects THAT operation instead of creating a new one.
   * The original cash row is edited in place, so the wallet moves by the
   * difference only: nothing is duplicated and the loan keeps one operation (S11).
   */
  pago?: PrestamoPago | null
  onClose: () => void
  onSuccess: () => void
}

/** The one RPC that registers both a payment (Debo) and a collection (Me deben). */
const RPC_PAGO = 'fn_prestamo_registrar_pago'
const RPC_CORREGIR = 'fn_prestamo_corregir_pago'
const ERROR_SOBREPAGO = 'error_overpayment_confirmation_required'

export function RegistrarPagoModal({
  isOpen,
  target,
  pago = null,
  onClose,
  onSuccess,
}: RegistrarPagoModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()

  const { prestamo_id: prestamoId, nombre, moneda, saldo_pendiente: saldoPendiente, direccion } = target

  const [billeteras, setBilleteras] = useState<BilleteraOption[]>([])
  const [cargandoBilleteras, setCargandoBilleteras] = useState(true)
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [montoBilletera, setMontoBilletera] = useState('')
  const [montoAplicado, setMontoAplicado] = useState('')
  const [aplicadoManual, setAplicadoManual] = useState(false)
  const [fecha, setFecha] = useState(() => fechaLocalISO())
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [excedente, setExcedente] = useState<number | null>(null)

  const esCobro = direccion === 'me_deben'
  const correccion = pago !== null
  const pagoId = pago?.pago_id ?? null

  useEffect(() => {
    if (!isOpen) return
    // In correction mode both money legs start at what the operation says today, so
    // the user sees the two numbers they are about to change.
    setMontoBilletera(pago?.monto_billetera != null ? String(pago.monto_billetera) : '')
    setMontoAplicado(pago?.monto_aplicado != null ? String(pago.monto_aplicado) : '')
    setAplicadoManual(correccion)
    setFecha(pago?.fecha ?? fechaLocalISO())
    setNota(pago?.nota ?? '')
    setError(null)
    setGuardando(false)
    setExcedente(null)
  }, [isOpen, prestamoId, pagoId, correccion, pago])

  useEffect(() => {
    if (!isOpen) return
    let vigente = true
    setCargandoBilleteras(true)
    rpc<BilleteraOption[]>('fn_obtener_billeteras_activas')
      .then((filas) => {
        if (!vigente) return
        const lista = Array.isArray(filas) ? filas : []
        setBilleteras(lista)
        // La billetera de la moneda del préstamo es la que no exige conversión.
        const mismaMoneda = lista.find((b) => b.moneda === moneda)
        setBilleteraId((actual) => {
          // A correction starts on the wallet the operation already used.
          if (correccion && pago?.billetera_id) return pago.billetera_id
          return actual ?? (mismaMoneda ?? lista[0])?.billetera_id ?? null
        })
      })
      .catch((err) => {
        if (!vigente) return
        showToast(parseError(err), 'error')
      })
      .finally(() => {
        if (vigente) setCargandoBilleteras(false)
      })
    return () => {
      vigente = false
    }
  }, [isOpen, moneda, showToast, correccion, pago])

  // El `<select>` siempre muestra una opción: si el estado todavía no tiene id,
  // manda la primera de la lista. Si no, el formulario mostraría una billetera y
  // rechazaría el envío por «elegí una billetera».
  const billeteraEfectivaId = billeteraId ?? billeteras[0]?.billetera_id ?? null
  const billetera = useMemo(
    () => billeteras.find((b) => b.billetera_id === billeteraEfectivaId) ?? null,
    [billeteras, billeteraEfectivaId],
  )

  const monedaBilletera = billetera?.moneda ?? moneda
  const mismaMoneda = monedaBilletera.toUpperCase() === moneda.toUpperCase()

  // Con la misma moneda, el importe aplicado sigue al importe de la billetera hasta
  // que el usuario lo toca: el caso normal es un único número (§4.2). Con monedas
  // distintas NO se copia nada: ORD no inventa un tipo de cambio (§4.3).
  const aplicadoEfectivo = aplicadoManual ? montoAplicado : mismaMoneda ? montoBilletera : montoAplicado

  const montoBilleteraNum = Number(montoBilletera)
  const aplicadoNum = Number(aplicadoEfectivo)
  const montosValidos =
    Number.isFinite(montoBilleteraNum) &&
    montoBilleteraNum > 0 &&
    Number.isFinite(aplicadoNum) &&
    aplicadoNum > 0

  /**
   * How much of the loan can still be settled by this operation. A correction
   * already took part of the balance, so its ceiling is what is pending today plus
   * what this very operation applied — never the pending balance alone, which would
   * flag every correction as an overpayment.
   */
  const topeAplicable = useMemo(() => {
    const saldo = numero(saldoPendiente) ?? 0
    const yaAplicado = correccion ? numero(pago?.monto_aplicado) ?? 0 : 0
    return saldo + yaAplicado
  }, [saldoPendiente, correccion, pago])

  const registrar = async (confirmarExcedente: boolean) => {
    // Un doble toque en «Sí, son intereses» no puede registrar el pago dos veces.
    if (guardando) return
    setError(null)
    if (!billeteraEfectivaId) {
      setError(t('prestamos_pago_error_billetera'))
      return
    }
    if (!montosValidos) {
      setError(t('prestamos_pago_error_monto'))
      return
    }
    setGuardando(true)
    try {
      const comun = {
        p_billetera_id: billeteraEfectivaId,
        p_monto_billetera: montoBilleteraNum,
        p_moneda_billetera: monedaBilletera,
        p_monto_aplicado: aplicadoNum,
        p_fecha: fecha,
        p_nota: nota.trim() === '' ? null : nota.trim(),
        p_confirmar_excedente: confirmarExcedente,
      }
      if (correccion && pagoId !== null) {
        await rpc(RPC_CORREGIR, { p_pago_id: pagoId, ...comun })
      } else {
        await rpc(RPC_PAGO, { p_prestamo_id: prestamoId, ...comun })
      }
      haptics.success()
      showToast(t(correccion ? 'prestamos_correccion_exito' : 'prestamos_pago_exito'), 'success')
      setExcedente(null)
      onSuccess()
      onClose()
    } catch (err) {
      const crudo = String((err as { message?: string })?.message ?? err)
      if (crudo.includes(ERROR_SOBREPAGO)) {
        // Sobrepago: la diferencia se muestra y NADA se registra hasta que el
        // usuario confirme que son intereses no registrados (S10).
        setExcedente(Math.max(0, aplicadoNum - topeAplicable))
        return
      }
      setError(parseError(err))
      haptics.error()
    } finally {
      setGuardando(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="prestamos-overlay" onClick={onClose}>
        <form
          className="prestamos-modal"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault()
            void registrar(false)
          }}
        >
          <header className="prestamos-modal-header">
            <div>
              <h2 className="font-display">
                {correccion
                  ? t(esCobro ? 'prestamos_correccion_titulo_cobro' : 'prestamos_correccion_titulo_pago')
                  : t(esCobro ? 'prestamos_pago_titulo_cobro' : 'prestamos_pago_titulo_pago')}
              </h2>
              <p className="prestamos-modal-sub">
                {nombre} · {montoONoCalculable(saldoPendiente, moneda)}
              </p>
            </div>
            <button
              type="button"
              className="prestamos-modal-close"
              onClick={onClose}
              aria-label={t('btn_close')}
            >
              ×
            </button>
          </header>

          <div className="prestamos-modal-body">
            {correccion && (
              // The user must know that this edits the ORIGINAL operation: one
              // movement adjusted, not a second one added.
              <p className="prestamos-nota prestamos-nota-destacada">
                {t('prestamos_correccion_aviso')}
              </p>
            )}
            {cargandoBilleteras ? (
              <p className="prestamos-hint">{t('prestamos_loading')}</p>
            ) : billeteras.length === 0 ? (
              <p className="prestamos-hint">{t('prestamos_pago_sin_billeteras')}</p>
            ) : (
              <>
                <div className="prestamos-field">
                  <label htmlFor="prestamo-pago-billetera">{t('prestamos_pago_billetera')}</label>
                  <select
                    id="prestamo-pago-billetera"
                    value={billeteraEfectivaId ?? ''}
                    onChange={(e) => setBilleteraId(Number(e.target.value))}
                  >
                    {billeteras.map((b) => (
                      <option key={b.billetera_id} value={b.billetera_id}>
                        {b.nombre} · {b.moneda}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="prestamos-field">
                  <label htmlFor="prestamo-pago-monto">{t('prestamos_pago_monto_billetera')}</label>
                  <input
                    id="prestamo-pago-monto"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={montoBilletera}
                    onChange={(e) => setMontoBilletera(e.target.value)}
                    placeholder="0"
                    enterKeyHint="next"
                  />
                  <span className="prestamos-field-hint">{monedaBilletera}</span>
                </div>

                <div className="prestamos-field">
                  <label htmlFor="prestamo-pago-aplicado">{t('prestamos_pago_monto_aplicado')}</label>
                  <input
                    id="prestamo-pago-aplicado"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={aplicadoEfectivo}
                    onChange={(e) => {
                      setAplicadoManual(true)
                      setMontoAplicado(e.target.value)
                    }}
                    placeholder="0"
                    enterKeyHint="next"
                  />
                  <span className="prestamos-field-hint">
                    {mismaMoneda ? moneda : t('prestamos_pago_monto_aplicado_ayuda')}
                  </span>
                </div>

                <div className="prestamos-field">
                  <label htmlFor="prestamo-pago-fecha">{t('prestamos_pago_fecha')}</label>
                  <input
                    id="prestamo-pago-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>

                <div className="prestamos-field">
                  <label htmlFor="prestamo-pago-nota">{t('prestamos_pago_nota')}</label>
                  <input
                    id="prestamo-pago-nota"
                    type="text"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    enterKeyHint="done"
                  />
                </div>
              </>
            )}

            {error && <p className="prestamos-error">{error}</p>}
          </div>

          <footer className="prestamos-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('btn_cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={guardando || cargandoBilleteras || billeteras.length === 0}
            >
              {correccion
                ? guardando
                  ? t('prestamos_correccion_guardando')
                  : t('prestamos_correccion_guardar')
                : guardando
                  ? t('prestamos_pago_guardando')
                  : t('prestamos_pago_guardar')}
            </button>
          </footer>
        </form>
      </div>

      {/* Fuera del overlay de pago a propósito: un click en su fondo no debe
       *  cerrar el formulario, y cancelar acá NO registra nada (S10). */}
      <ConfirmModal
        isOpen={excedente !== null}
        title={t('prestamos_pago_sobrepago_titulo')}
        message={t('prestamos_pago_sobrepago_msg', {
          excedente: formatCurrency(excedente ?? 0, moneda),
        })}
        confirmText={t('prestamos_pago_sobrepago_confirmar')}
        cancelText={t('prestamos_pago_sobrepago_cancelar')}
        onConfirm={() => void registrar(true)}
        onCancel={() => setExcedente(null)}
      />
    </>
  )
}
