import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { fechaLocalISO, getFormatContext } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { numero, type CondicionInteres, type Direccion, type Modalidad } from './types'
import { montoONoCalculable } from './formato'
import { CuotasEditor, construirCuotas, nuevaFilaCuota, type FilaCuota } from './CuotasEditor'
import './prestamos.css'

interface BilleteraOption {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number | null
}

interface PrestamoFormModalProps {
  isOpen: boolean
  /** Section the user came from. The form still lets them change it. */
  direccionInicial: Direccion
  onClose: () => void
  onSuccess: () => void
}

const RPC_CREAR = 'fn_prestamo_crear'

const MODALIDADES: { valor: Modalidad; clave: string }[] = [
  { valor: 'cuotas', clave: 'prestamos_lista_modalidad_cuotas' },
  { valor: 'vencimiento_unico', clave: 'prestamos_lista_modalidad_vencimiento_unico' },
  { valor: 'libre', clave: 'prestamos_lista_modalidad_libre' },
]

const CONDICIONES: { valor: CondicionInteres; clave: string }[] = [
  { valor: 'ninguno', clave: 'prestamos_condicion_ninguno' },
  { valor: 'importe_final', clave: 'prestamos_condicion_importe_final' },
  { valor: 'tasa', clave: 'prestamos_condicion_tasa' },
  { valor: 'desconocido', clave: 'prestamos_condicion_desconocido' },
]

/**
 * Create a loan, in either direction, as a new loan or as a historical one (S4,
 * S5, S6).
 *
 * The difference that must never be blurred: a NEW loan writes exactly one cash
 * movement, so it needs a wallet and the amount actually moved. A HISTORICAL loan
 * writes none, so it must be asked for the ORIGINAL amount AND the current pending
 * balance as two separate numbers — deriving one from the other would silently
 * rewrite history that happened outside ORD.
 *
 * Modalities: installments with dates require a schedule; the other two must send
 * none, and the backend rejects a schedule that does not belong to the modality.
 */
export function PrestamoFormModal({
  isOpen,
  direccionInicial,
  onClose,
  onSuccess,
}: PrestamoFormModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()

  const [direccion, setDireccion] = useState<Direccion>(direccionInicial)
  const [historico, setHistorico] = useState(false)
  const [contraparte, setContraparte] = useState('')
  const [nombre, setNombre] = useState('')
  const [personal, setPersonal] = useState(true)
  const [moneda, setMoneda] = useState(() => getFormatContext().localCurrency)
  const [montoOriginal, setMontoOriginal] = useState('')
  const [saldoActual, setSaldoActual] = useState('')
  const [modalidad, setModalidad] = useState<Modalidad>('libre')
  const [condicion, setCondicion] = useState<CondicionInteres>('desconocido')
  const [tasaAnual, setTasaAnual] = useState('')
  const [interesTotal, setInteresTotal] = useState('')
  const [proximoVencimiento, setProximoVencimiento] = useState('')
  const [cuotas, setCuotas] = useState<FilaCuota[]>(() => [nuevaFilaCuota()])

  const [billeteras, setBilleteras] = useState<BilleteraOption[]>([])
  const [cargandoBilleteras, setCargandoBilleteras] = useState(true)
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [montoBilletera, setMontoBilletera] = useState('')
  const [montoBilleteraManual, setMontoBilleteraManual] = useState(false)
  const [fecha, setFecha] = useState(() => fechaLocalISO())
  const [nota, setNota] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Reset on open: reusing the modal must never inherit the previous loan.
  useEffect(() => {
    if (!isOpen) return
    setDireccion(direccionInicial)
    setHistorico(false)
    setContraparte('')
    setNombre('')
    setPersonal(true)
    setMoneda(getFormatContext().localCurrency)
    setMontoOriginal('')
    setSaldoActual('')
    setModalidad('libre')
    setCondicion('desconocido')
    setTasaAnual('')
    setInteresTotal('')
    setProximoVencimiento('')
    setCuotas([nuevaFilaCuota()])
    setMontoBilletera('')
    setMontoBilleteraManual(false)
    setFecha(fechaLocalISO())
    setNota('')
    setError(null)
    setGuardando(false)
  }, [isOpen, direccionInicial])

  useEffect(() => {
    if (!isOpen) return
    let vigente = true
    setCargandoBilleteras(true)
    rpc<BilleteraOption[]>('fn_obtener_billeteras_activas')
      .then((filas) => {
        if (!vigente) return
        const lista = Array.isArray(filas) ? filas : []
        setBilleteras(lista)
        const mismaMoneda = lista.find((b) => b.moneda === moneda)
        setBilleteraId((actual) => actual ?? (mismaMoneda ?? lista[0])?.billetera_id ?? null)
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
  }, [isOpen, moneda, showToast])

  const billeteraEfectivaId = billeteraId ?? billeteras[0]?.billetera_id ?? null
  const billetera = useMemo(
    () => billeteras.find((b) => b.billetera_id === billeteraEfectivaId) ?? null,
    [billeteras, billeteraEfectivaId],
  )
  const monedaBilletera = billetera?.moneda ?? moneda
  const mismaMoneda = monedaBilletera.toUpperCase() === moneda.trim().toUpperCase()

  const montoOriginalNum = numero(montoOriginal)
  const interesTotalNum = condicion === 'importe_final' ? numero(interesTotal) : null

  /**
   * Pending balance at registration. On a historical loan the user states it; on a
   * new one it is the agreed total (principal plus a known final interest), which is
   * the amount that was actually owed the day it started.
   */
  const saldoInicial = useMemo(() => {
    if (historico) return numero(saldoActual)
    if (montoOriginalNum === null) return null
    return montoOriginalNum + (interesTotalNum ?? 0)
  }, [historico, saldoActual, montoOriginalNum, interesTotalNum])

  // With one currency, the wallet amount follows the principal until the user
  // touches it. With two, nothing is copied: ORD never invents an exchange rate.
  const montoBilleteraEfectivo =
    montoBilleteraManual || !mismaMoneda ? montoBilletera : montoOriginal

  const filasValidas = useMemo(
    () => cuotas.filter((f) => f.fecha.trim() !== '' && Number(f.monto) > 0),
    [cuotas],
  )

  // Only the installment modality carries a schedule; the other two must send none.
  const cuotasAEnviar = modalidad === 'cuotas' ? construirCuotas(cuotas) : null

  /**
   * A real 0 % and an unknown rate are not the same thing (P11). «No interest» is a
   * rate that was informed — zero. «Unknown» is exactly what `p_tasa_informada`
   * exists for.
   */
  const tasaInformada = condicion === 'ninguno' || condicion === 'tasa'
  const tasaAEnviar =
    condicion === 'ninguno' ? 0 : condicion === 'tasa' ? numero(tasaAnual) : null

  const vencimientoAEnviar = () => {
    if (modalidad === 'vencimiento_unico') return proximoVencimiento || null
    if (modalidad === 'cuotas' && filasValidas.length > 0) {
      // The earliest installment the user typed. Never a projected date.
      return [...filasValidas].map((f) => f.fecha).sort()[0]
    }
    return null
  }

  const crear = async () => {
    if (guardando) return
    setError(null)

    const monedaLimpia = moneda.trim().toUpperCase()
    if (contraparte.trim() === '') {
      setError(t('prestamos_alta_error_contraparte'))
      return
    }
    if (montoOriginalNum === null || montoOriginalNum <= 0) {
      setError(t('prestamos_alta_error_monto_original'))
      return
    }
    if (monedaLimpia.length !== 3) {
      setError(t('prestamos_alta_error_moneda'))
      return
    }
    if (historico && (saldoInicial === null || saldoInicial < 0)) {
      setError(t('prestamos_alta_error_saldo_actual'))
      return
    }
    if (modalidad === 'cuotas' && filasValidas.length === 0) {
      setError(t('prestamos_alta_error_cronograma'))
      return
    }
    if (modalidad === 'vencimiento_unico' && proximoVencimiento === '') {
      setError(t('prestamos_alta_error_vencimiento'))
      return
    }
    if (condicion === 'tasa' && (tasaAEnviar === null || tasaAEnviar < 0)) {
      setError(t('prestamos_alta_error_tasa'))
      return
    }
    if (condicion === 'importe_final' && (interesTotalNum === null || interesTotalNum < 0)) {
      setError(t('prestamos_alta_error_interes'))
      return
    }

    const montoBilleteraNum = Number(montoBilleteraEfectivo)
    if (!historico) {
      if (!billeteraEfectivaId) {
        setError(t('prestamos_alta_error_billetera'))
        return
      }
      if (!Number.isFinite(montoBilleteraNum) || montoBilleteraNum <= 0) {
        setError(t('prestamos_alta_error_monto_billetera'))
        return
      }
    }

    setGuardando(true)
    try {
      await rpc(RPC_CREAR, {
        p_direccion: direccion,
        p_contraparte: contraparte.trim(),
        p_moneda: monedaLimpia,
        p_monto_original: montoOriginalNum,
        p_modalidad: modalidad,
        p_es_historico: historico,
        p_nombre: nombre.trim() === '' ? null : nombre.trim(),
        p_tipo_deuda: personal ? 'personal' : 'institucional',
        p_saldo_al_ingreso: saldoInicial,
        p_condicion_interes: condicion,
        p_tasa_anual: tasaAEnviar,
        p_tasa_informada: tasaInformada,
        p_interes_total_acordado: interesTotalNum,
        p_proximo_vencimiento: vencimientoAEnviar(),
        // A historical loan moves no money: it sends no wallet at all.
        p_billetera_id: historico ? null : billeteraEfectivaId,
        p_monto_billetera: historico ? null : montoBilleteraNum,
        p_moneda_billetera: historico ? null : monedaBilletera,
        p_fecha: historico ? null : fecha,
        p_nota: nota.trim() === '' ? null : nota.trim(),
        p_cuotas: cuotasAEnviar,
      })
      haptics.success()
      showToast(t('prestamos_alta_exito'), 'success')
      onSuccess()
      onClose()
    } catch (err) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setGuardando(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="prestamos-overlay" onClick={onClose}>
      <form
        className="prestamos-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <header className="prestamos-modal-header">
          <div>
            <h2 className="font-display">{t('prestamos_alta_titulo')}</h2>
            <p className="prestamos-modal-sub">{t('prestamos_alta_subtitulo')}</p>
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
          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_direccion')}</legend>
            <div className="prestamos-chips">
              <button
                type="button"
                className={`prestamos-chip ${direccion === 'debo' ? 'is-activo' : ''}`}
                onClick={() => setDireccion('debo')}
              >
                {t('prestamos_menu_debo')}
              </button>
              <button
                type="button"
                className={`prestamos-chip ${direccion === 'me_deben' ? 'is-activo' : ''}`}
                onClick={() => setDireccion('me_deben')}
              >
                {t('prestamos_menu_me_deben')}
              </button>
            </div>
          </fieldset>

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_origen')}</legend>
            <div className="prestamos-chips">
              <button
                type="button"
                className={`prestamos-chip ${!historico ? 'is-activo' : ''}`}
                onClick={() => setHistorico(false)}
              >
                {t('prestamos_alta_nuevo')}
              </button>
              <button
                type="button"
                className={`prestamos-chip ${historico ? 'is-activo' : ''}`}
                onClick={() => setHistorico(true)}
              >
                {t('prestamos_alta_historico')}
              </button>
            </div>
            <span className="prestamos-field-hint">
              {t(historico ? 'prestamos_alta_historico_ayuda' : 'prestamos_alta_nuevo_ayuda')}
            </span>
          </fieldset>

          <div className="prestamos-field">
            <label htmlFor="prestamo-alta-contraparte">{t('prestamos_alta_contraparte')}</label>
            <input
              id="prestamo-alta-contraparte"
              type="text"
              value={contraparte}
              onChange={(e) => setContraparte(e.target.value)}
              enterKeyHint="next"
            />
          </div>

          <div className="prestamos-field">
            <label htmlFor="prestamo-alta-nombre">{t('prestamos_alta_nombre')}</label>
            <input
              id="prestamo-alta-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={contraparte}
              enterKeyHint="next"
            />
            <span className="prestamos-field-hint">{t('prestamos_alta_nombre_ayuda')}</span>
          </div>

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_tipo')}</legend>
            <div className="prestamos-chips">
              <button
                type="button"
                className={`prestamos-chip ${personal ? 'is-activo' : ''}`}
                onClick={() => setPersonal(true)}
              >
                {t('prestamos_saneamiento_personal')}
              </button>
              <button
                type="button"
                className={`prestamos-chip ${!personal ? 'is-activo' : ''}`}
                onClick={() => setPersonal(false)}
              >
                {t('prestamos_saneamiento_institucional')}
              </button>
            </div>
          </fieldset>

          <div className="prestamos-field-row">
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-moneda">{t('prestamos_alta_moneda')}</label>
              <input
                id="prestamo-alta-moneda"
                type="text"
                inputMode="text"
                maxLength={3}
                value={moneda}
                onChange={(e) => setMoneda(e.target.value.toUpperCase())}
              />
            </div>
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-original">{t('prestamos_lista_original')}</label>
              <input
                id="prestamo-alta-original"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={montoOriginal}
                onChange={(e) => setMontoOriginal(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {historico ? (
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-saldo">{t('prestamos_alta_saldo_actual')}</label>
              <input
                id="prestamo-alta-saldo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={saldoActual}
                onChange={(e) => setSaldoActual(e.target.value)}
                placeholder="0"
              />
              <span className="prestamos-field-hint">{t('prestamos_alta_saldo_actual_ayuda')}</span>
            </div>
          ) : (
            <div className="prestamos-field">
              <span className="prestamos-alta-derivado">
                {t('prestamos_alta_saldo_inicial')}:{' '}
                {montoONoCalculable(saldoInicial, moneda.trim() || getFormatContext().localCurrency)}
              </span>
            </div>
          )}

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_modalidad')}</legend>
            <div className="prestamos-chips">
              {MODALIDADES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  className={`prestamos-chip ${modalidad === opcion.valor ? 'is-activo' : ''}`}
                  onClick={() => setModalidad(opcion.valor)}
                >
                  {t(opcion.clave)}
                </button>
              ))}
            </div>
          </fieldset>

          {modalidad === 'vencimiento_unico' && (
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-vencimiento">{t('prestamos_lista_vencimiento')}</label>
              <input
                id="prestamo-alta-vencimiento"
                type="date"
                value={proximoVencimiento}
                onChange={(e) => setProximoVencimiento(e.target.value)}
              />
            </div>
          )}

          {modalidad === 'cuotas' && (
            <CuotasEditor
              filas={cuotas}
              moneda={moneda.trim() || getFormatContext().localCurrency}
              onChange={setCuotas}
            />
          )}

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_condicion')}</legend>
            <div className="prestamos-chips">
              {CONDICIONES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  className={`prestamos-chip ${condicion === opcion.valor ? 'is-activo' : ''}`}
                  onClick={() => setCondicion(opcion.valor)}
                >
                  {t(opcion.clave)}
                </button>
              ))}
            </div>
          </fieldset>

          {condicion === 'tasa' && (
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-tasa">{t('prestamos_lista_tasa')}</label>
              <input
                id="prestamo-alta-tasa"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={tasaAnual}
                onChange={(e) => setTasaAnual(e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          {condicion === 'importe_final' && (
            <div className="prestamos-field">
              <label htmlFor="prestamo-alta-interes">{t('prestamos_alta_interes_total')}</label>
              <input
                id="prestamo-alta-interes"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={interesTotal}
                onChange={(e) => setInteresTotal(e.target.value)}
                placeholder="0"
              />
              <span className="prestamos-field-hint">{t('prestamos_alta_interes_total_ayuda')}</span>
            </div>
          )}

          {!historico && (
            <>
              <div className="prestamos-field">
                <label htmlFor="prestamo-alta-billetera">{t('prestamos_pago_billetera')}</label>
                {cargandoBilleteras ? (
                  <p className="prestamos-hint">{t('prestamos_loading')}</p>
                ) : billeteras.length === 0 ? (
                  <p className="prestamos-hint">{t('prestamos_pago_sin_billeteras')}</p>
                ) : (
                  <select
                    id="prestamo-alta-billetera"
                    value={billeteraEfectivaId ?? ''}
                    onChange={(e) => {
                      setBilleteraId(Number(e.target.value))
                      setMontoBilleteraManual(false)
                      setMontoBilletera('')
                    }}
                  >
                    {billeteras.map((b) => (
                      <option key={b.billetera_id} value={b.billetera_id}>
                        {b.nombre} · {b.moneda}
                      </option>
                    ))}
                  </select>
                )}
                <span className="prestamos-field-hint">{t('prestamos_alta_movimiento_ayuda')}</span>
              </div>

              <div className="prestamos-field">
                <label htmlFor="prestamo-alta-monto-billetera">
                  {t('prestamos_pago_monto_billetera')}
                </label>
                <input
                  id="prestamo-alta-monto-billetera"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={montoBilleteraEfectivo}
                  onChange={(e) => {
                    setMontoBilleteraManual(true)
                    setMontoBilletera(e.target.value)
                  }}
                  placeholder="0"
                />
                <span className="prestamos-field-hint">
                  {mismaMoneda ? monedaBilletera : t('prestamos_alta_monto_billetera_ayuda')}
                </span>
              </div>

              <div className="prestamos-field">
                <label htmlFor="prestamo-alta-fecha">{t('prestamos_pago_fecha')}</label>
                <input
                  id="prestamo-alta-fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="prestamos-field">
            <label htmlFor="prestamo-alta-nota">{t('prestamos_pago_nota')}</label>
            <input
              id="prestamo-alta-nota"
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              enterKeyHint="done"
            />
          </div>

          {error && <p className="prestamos-error">{error}</p>}
        </div>

        <footer className="prestamos-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={guardando || (!historico && billeteras.length === 0)}
          >
            {guardando ? t('prestamos_alta_guardando') : t('prestamos_alta_guardar')}
          </button>
        </footer>
      </form>
    </div>
  )
}
