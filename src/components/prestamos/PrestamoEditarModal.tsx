import { useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import {
  numero,
  type CondicionInteres,
  type Modalidad,
  type PrestamoDetalle,
} from './types'
import { montoONoCalculable } from './formato'
import {
  CuotasEditor,
  construirCuotas,
  filaDesdeCuota,
  nuevaFilaCuota,
  type FilaCuota,
} from './CuotasEditor'
import './prestamos.css'

interface PrestamoEditarModalProps {
  isOpen: boolean
  detalle: PrestamoDetalle
  onClose: () => void
  onSuccess: () => void
}

const RPC_EDITAR = 'fn_prestamo_editar'

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

/** Fields the user actually touched: everything else travels as `null`. */
type Campo =
  | 'contraparte'
  | 'nombre'
  | 'tipo_deuda'
  | 'monto_original'
  | 'saldo_al_ingreso'
  | 'condicion'
  | 'tasa'
  | 'interes'
  | 'vencimiento'
  | 'modalidad'
  | 'cuotas'

type TipoDeuda = 'personal' | 'institucional'

/** `tipo_deuda` as the detail returns it; anything else is «not informed». */
function tipoDeudaDesdeDetalle(valor: string | null | undefined): TipoDeuda | null {
  return valor === 'personal' || valor === 'institucional' ? valor : null
}

/**
 * Edit the CONDITIONS of a loan (S11, T5).
 *
 * Two things this screen must not let anyone believe:
 *   1. Editing conditions creates NO cash movement and does not touch the
 *      payments and collections already recorded. The text says so.
 *   2. A null parameter means «leave as is», so the payload carries only what the
 *      user touched. Clearing the due date cannot travel as null — that is what
 *      `p_limpiar_vencimiento` exists for. The same holds for the optional agreed
 *      interest, which is cleared through `p_limpiar_interes`.
 */
export function PrestamoEditarModal({
  isOpen,
  detalle,
  onClose,
  onSuccess,
}: PrestamoEditarModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()

  // The parent mounts this modal only while it is open, so the fields are seeded
  // from the current loan once, at mount, and never re-seeded behind the user's back.
  const [tocado, setTocado] = useState<Set<Campo>>(() => new Set())

  const [contraparte, setContraparte] = useState(() => detalle.contraparte ?? '')
  const [nombre, setNombre] = useState(() => detalle.nombre ?? '')
  // Prefilled from the detail so the chips show the stored type. When the backend
  // reports nothing, no chip is active and nothing is sent unless the user picks one.
  const tipoDeudaInicial = tipoDeudaDesdeDetalle(detalle.tipo_deuda)
  const [tipoDeuda, setTipoDeuda] = useState<TipoDeuda | null>(tipoDeudaInicial)
  const [montoOriginal, setMontoOriginal] = useState(() =>
    detalle.monto_original === null || detalle.monto_original === undefined
      ? ''
      : String(detalle.monto_original),
  )
  const [saldoAlIngreso, setSaldoAlIngreso] = useState(() =>
    detalle.saldo_al_ingreso === null || detalle.saldo_al_ingreso === undefined
      ? ''
      : String(detalle.saldo_al_ingreso),
  )
  const [condicion, setCondicion] = useState<CondicionInteres>(
    () => detalle.condicion_interes ?? 'desconocido',
  )
  const [tasaAnual, setTasaAnual] = useState(() =>
    detalle.tasa === null || detalle.tasa === undefined ? '' : String(detalle.tasa),
  )
  const [interesTotal, setInteresTotal] = useState(() =>
    detalle.interes_total_acordado === null || detalle.interes_total_acordado === undefined
      ? ''
      : String(detalle.interes_total_acordado),
  )
  const [proximoVencimiento, setProximoVencimiento] = useState(() => detalle.proximo_vencimiento ?? '')
  const [limpiarVencimiento, setLimpiarVencimiento] = useState(false)
  const [modalidad, setModalidad] = useState<Modalidad>(() => detalle.modalidad ?? 'libre')
  const [cuotas, setCuotas] = useState<FilaCuota[]>(() => {
    const programadas = (detalle.cuotas ?? []).map((cuota) =>
      filaDesdeCuota(cuota.fecha_vencimiento, cuota.monto_cuota, cuota.interes_componente),
    )
    return programadas.length > 0 ? programadas : [nuevaFilaCuota()]
  })

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const marcar = (campo: Campo) => {
    setTocado((actual) => {
      if (actual.has(campo)) return actual
      const siguiente = new Set(actual)
      siguiente.add(campo)
      return siguiente
    })
  }

  const tienePagos = (detalle.pagos ?? []).length > 0
  const condicionInicial = detalle.condicion_interes ?? 'desconocido'
  const modalidadCambiada = modalidad !== (detalle.modalidad ?? 'libre')
  const modalidadBloqueada = tienePagos && modalidadCambiada
  const tipoDeudaCambiado = tipoDeuda !== null && tipoDeuda !== tipoDeudaInicial

  const tasaInformada = condicion === 'ninguno' || condicion === 'tasa'
  const tasaAEnviar =
    condicion === 'ninguno' ? 0 : condicion === 'tasa' ? numero(tasaAnual) : null

  const vencimientoAEnviar = useMemo(() => {
    if (limpiarVencimiento) return null
    if (modalidad === 'cuotas') {
      const fechas = cuotas.filter((f) => f.fecha.trim() !== '').map((f) => f.fecha)
      if (fechas.length > 0) return [...fechas].sort()[0]
    }
    return proximoVencimiento || null
  }, [limpiarVencimiento, modalidad, cuotas, proximoVencimiento])

  const guardar = async () => {
    if (guardando) return
    setError(null)

    if (tocado.has('contraparte') && contraparte.trim() === '') {
      setError(t('prestamos_editar_error_contraparte'))
      return
    }
    if (tocado.has('nombre') && nombre.trim() === '') {
      setError(t('prestamos_editar_error_nombre'))
      return
    }
    if (tocado.has('monto_original')) {
      const monto = numero(montoOriginal)
      if (monto === null || monto <= 0) {
        setError(t('prestamos_alta_error_monto_original'))
        return
      }
    }
    if (tocado.has('saldo_al_ingreso')) {
      const saldo = numero(saldoAlIngreso)
      if (saldo === null || saldo < 0) {
        setError(t('prestamos_editar_error_saldo_ingreso'))
        return
      }
    }
    if (tocado.has('tasa') && condicion === 'tasa' && (tasaAEnviar === null || tasaAEnviar < 0)) {
      setError(t('prestamos_alta_error_tasa'))
      return
    }
    if (tocado.has('interes') && condicion === 'importe_final' && interesTotal.trim() !== '') {
      const interes = numero(interesTotal)
      if (interes === null || interes < 0) {
        setError(t('prestamos_alta_error_interes'))
        return
      }
    }
    if (modalidadBloqueada) {
      setError(t('error_cannot_change_modality_with_payments'))
      return
    }
    if (tocado.size === 0) {
      // Nothing to send: an empty call would be a no-op that still looks like a save.
      setError(t('prestamos_editar_sin_cambios'))
      return
    }

    const cuotasAEnviar =
      modalidad === 'cuotas' && (tocado.has('cuotas') || modalidadCambiada)
        ? construirCuotas(cuotas)
        : null
    if (modalidad === 'cuotas' && modalidadCambiada && cuotasAEnviar === null) {
      setError(t('prestamos_alta_error_cronograma'))
      return
    }

    const params: Record<string, unknown> = { p_prestamo_id: detalle.prestamo_id }
    if (tocado.has('contraparte')) params.p_contraparte = contraparte.trim()
    if (tocado.has('nombre')) params.p_nombre = nombre.trim()
    if (tipoDeudaCambiado) params.p_tipo_deuda = tipoDeuda
    if (tocado.has('monto_original')) params.p_monto_original = numero(montoOriginal)
    if (tocado.has('saldo_al_ingreso')) params.p_saldo_al_ingreso = numero(saldoAlIngreso)
    if (tocado.has('condicion')) {
      params.p_condicion_interes = condicion
      params.p_tasa_informada = tasaInformada
      params.p_tasa_anual = tasaAEnviar
    } else if (tocado.has('tasa')) {
      params.p_tasa_anual = tasaAEnviar
      params.p_tasa_informada = tasaInformada
    }
    // An emptied interest field, or picking «no interest», REMOVES the optional
    // condition: null would travel as «leave as is», so it goes through the flag.
    const interesNum = numero(interesTotal)
    if (condicion === 'ninguno' && condicion !== condicionInicial) {
      params.p_limpiar_interes = true
    } else if (condicion === 'importe_final' && tocado.has('interes')) {
      if (interesNum === null) params.p_limpiar_interes = true
      else params.p_interes_total_acordado = interesNum
    }
    if (tocado.has('vencimiento') || limpiarVencimiento) {
      // An emptied date field means the same as the checkbox: null cannot travel
      // as «leave as is», so clearing always uses p_limpiar_vencimiento.
      if (limpiarVencimiento || vencimientoAEnviar === null) {
        params.p_limpiar_vencimiento = true
      } else {
        params.p_proximo_vencimiento = vencimientoAEnviar
      }
    }
    if (tocado.has('modalidad')) params.p_modalidad = modalidad
    if (cuotasAEnviar !== null) params.p_cuotas = cuotasAEnviar

    setGuardando(true)
    try {
      await rpc(RPC_EDITAR, params)
      haptics.success()
      showToast(t('prestamos_editar_exito'), 'success')
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
          void guardar()
        }}
      >
        <header className="prestamos-modal-header">
          <div>
            <h2 className="font-display">{t('prestamos_editar_titulo')}</h2>
            <p className="prestamos-modal-sub">
              {detalle.nombre} · {montoONoCalculable(detalle.saldo_pendiente, detalle.moneda)}
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
          <p className="prestamos-nota prestamos-nota-destacada">{t('prestamos_editar_aviso')}</p>

          <div className="prestamos-field">
            <label htmlFor="prestamo-editar-contraparte">{t('prestamos_alta_contraparte')}</label>
            <input
              id="prestamo-editar-contraparte"
              type="text"
              value={contraparte}
              onChange={(e) => {
                marcar('contraparte')
                setContraparte(e.target.value)
              }}
              enterKeyHint="next"
            />
          </div>

          <div className="prestamos-field">
            <label htmlFor="prestamo-editar-nombre">{t('prestamos_alta_nombre')}</label>
            <input
              id="prestamo-editar-nombre"
              type="text"
              value={nombre}
              onChange={(e) => {
                marcar('nombre')
                setNombre(e.target.value)
              }}
              enterKeyHint="next"
            />
          </div>

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_tipo')}</legend>
            <div className="prestamos-chips">
              <button
                type="button"
                className={`prestamos-chip ${tipoDeuda === 'personal' ? 'is-activo' : ''}`}
                onClick={() => {
                  if (tipoDeuda !== 'personal') marcar('tipo_deuda')
                  setTipoDeuda('personal')
                }}
              >
                {t('prestamos_saneamiento_personal')}
              </button>
              <button
                type="button"
                className={`prestamos-chip ${tipoDeuda === 'institucional' ? 'is-activo' : ''}`}
                onClick={() => {
                  if (tipoDeuda !== 'institucional') marcar('tipo_deuda')
                  setTipoDeuda('institucional')
                }}
              >
                {t('prestamos_saneamiento_institucional')}
              </button>
            </div>
          </fieldset>

          <div className="prestamos-field-row">
            <div className="prestamos-field">
              <label htmlFor="prestamo-editar-original">{t('prestamos_lista_original')}</label>
              <input
                id="prestamo-editar-original"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={montoOriginal}
                onChange={(e) => {
                  marcar('monto_original')
                  setMontoOriginal(e.target.value)
                }}
              />
            </div>
            <div className="prestamos-field">
              <label htmlFor="prestamo-editar-saldo">{t('prestamos_alta_saldo_actual')}</label>
              <input
                id="prestamo-editar-saldo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={saldoAlIngreso}
                onChange={(e) => {
                  marcar('saldo_al_ingreso')
                  setSaldoAlIngreso(e.target.value)
                }}
              />
            </div>
          </div>
          <span className="prestamos-field-hint">{t('prestamos_editar_saldo_ayuda')}</span>

          <fieldset className="prestamos-fieldset">
            <legend>{t('prestamos_alta_condicion')}</legend>
            <div className="prestamos-chips">
              {CONDICIONES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  className={`prestamos-chip ${condicion === opcion.valor ? 'is-activo' : ''}`}
                  onClick={() => {
                    marcar('condicion')
                    setCondicion(opcion.valor)
                  }}
                >
                  {t(opcion.clave)}
                </button>
              ))}
            </div>
          </fieldset>

          {condicion === 'tasa' && (
            <div className="prestamos-field">
              <label htmlFor="prestamo-editar-tasa">{t('prestamos_lista_tasa')}</label>
              <input
                id="prestamo-editar-tasa"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={tasaAnual}
                onChange={(e) => {
                  marcar('tasa')
                  setTasaAnual(e.target.value)
                }}
              />
            </div>
          )}

          {condicion === 'importe_final' && (
            <div className="prestamos-field">
              <label htmlFor="prestamo-editar-interes">{t('prestamos_alta_interes_total')}</label>
              <input
                id="prestamo-editar-interes"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={interesTotal}
                onChange={(e) => {
                  marcar('interes')
                  setInteresTotal(e.target.value)
                }}
              />
              <span className="prestamos-field-hint">{t('prestamos_editar_interes_ayuda')}</span>
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
                  onClick={() => {
                    marcar('modalidad')
                    setModalidad(opcion.valor)
                  }}
                >
                  {t(opcion.clave)}
                </button>
              ))}
            </div>
            {modalidadBloqueada && (
              <p className="prestamos-error">{t('error_cannot_change_modality_with_payments')}</p>
            )}
          </fieldset>

          <div className="prestamos-field">
            <label htmlFor="prestamo-editar-vencimiento">{t('prestamos_lista_vencimiento')}</label>
            <input
              id="prestamo-editar-vencimiento"
              type="date"
              value={proximoVencimiento}
              disabled={limpiarVencimiento || modalidad === 'cuotas'}
              onChange={(e) => {
                marcar('vencimiento')
                setProximoVencimiento(e.target.value)
              }}
            />
            <label className="prestamos-toggle">
              <input
                type="checkbox"
                checked={limpiarVencimiento}
                onChange={(e) => {
                  setLimpiarVencimiento(e.target.checked)
                  marcar('vencimiento')
                }}
              />
              <span>{t('prestamos_editar_limpiar_vencimiento')}</span>
            </label>
            {modalidad === 'cuotas' && (
              <span className="prestamos-field-hint">{t('prestamos_editar_vencimiento_cuotas')}</span>
            )}
          </div>

          {modalidad === 'cuotas' && (
            <CuotasEditor
              filas={cuotas}
              moneda={detalle.moneda}
              onChange={(filas) => {
                marcar('cuotas')
                setCuotas(filas)
              }}
            />
          )}

          {error && <p className="prestamos-error">{error}</p>}
        </div>

        <footer className="prestamos-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('btn_cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? t('prestamos_editar_guardando') : t('prestamos_editar_guardar')}
          </button>
        </footer>
      </form>
    </div>
  )
}
