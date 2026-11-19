import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { formatPercent } from '@/lib/format'
import {
  estadoKey,
  estadoTono,
  numero,
  type Estrategia,
  type PlanFila,
  type ProgresoMoneda,
  type SimulacionPrestamo,
} from './types'
import { fechaOTexto, montoONoCalculable, tasaTexto, textoEstadoVencimiento } from './formato'
import { SimulacionPrestamoModal } from './SimulacionPrestamoModal'
import { VinculosCuestionario } from './VinculosCuestionario'
import './prestamos.css'

const ESTRATEGIAS = [
  { key: 'math', label: 'prestamos_saneamiento_estrategia_math', desc: 'prestamos_saneamiento_estrategia_math_desc' },
  { key: 'emotional', label: 'prestamos_saneamiento_estrategia_emotional', desc: 'prestamos_saneamiento_estrategia_emotional_desc' },
  { key: 'relationships', label: 'prestamos_saneamiento_estrategia_relationships', desc: 'prestamos_saneamiento_estrategia_relationships_desc' },
] as const

// La estrategia activa se recuerda para las próximas visitas (S16). No hay RPC
// desplegada que la persista para el plan nuevo, así que se recuerda en el
// dispositivo: inventar una RPC queda fuera del contrato disponible.
const CLAVE_ESTRATEGIA = 'prestamos_saneamiento_estrategia'

function leerEstrategia(): Estrategia {
  try {
    const guardada = localStorage.getItem(CLAVE_ESTRATEGIA)
    if (guardada === 'math' || guardada === 'emotional' || guardada === 'relationships') return guardada
  } catch {
    // Almacenamiento bloqueado: el plan funciona igual con la estrategia por defecto.
  }
  return 'math'
}

function guardarEstrategia(estrategia: Estrategia) {
  try {
    localStorage.setItem(CLAVE_ESTRATEGIA, estrategia)
  } catch {
    // Sin almacenamiento la elección vive solo en esta visita.
  }
}

/** Tie group key: only loans of the same currency and the same rank can tie. */
function claveGrupo(fila: PlanFila): string {
  return `${fila.moneda}|${fila.prioridad}`
}

/**
 * Attack plan (S2, S16, S17, S18).
 *
 * The universe comes from the backend: only pending loans of «Debo», ranked
 * within each currency. The client never re-ranks, never mixes currencies and
 * never derives a status.
 *
 * Ties are a presentation problem only: rows that share `prioridad` keep equal
 * priority unless the user breaks the tie by hand, and that order is local.
 */
export function PlanAtaquePrestamos() {
  useFormatRevision()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [estrategia, setEstrategia] = useState<Estrategia>(() => leerEstrategia())
  const [plan, setPlan] = useState<PlanFila[]>([])
  const [progreso, setProgreso] = useState<ProgresoMoneda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vinculosAbierto, setVinculosAbierto] = useState(false)
  const [desempate, setDesempate] = useState<Record<string, number[]>>({})
  const [montos, setMontos] = useState<Record<number, string>>({})
  const [simulacion, setSimulacion] = useState<{
    fila: PlanFila
    resultado: SimulacionPrestamo
  } | null>(null)

  const cargar = useCallback(
    async (estrategiaActiva: Estrategia) => {
      setCargando(true)
      setError(null)
      try {
        const [filasPlan, filasProgreso] = await Promise.all([
          rpc<PlanFila[]>('fn_saneamiento_plan', { p_estrategia: estrategiaActiva }),
          rpc<ProgresoMoneda[]>('fn_saneamiento_progreso'),
        ])
        setPlan(Array.isArray(filasPlan) ? filasPlan : [])
        setProgreso(Array.isArray(filasProgreso) ? filasProgreso : [])
      } catch (err) {
        const mensaje = parseError(err) || t('error_generic')
        setError(mensaje)
        showToast(mensaje, 'error')
      } finally {
        setCargando(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    void cargar(estrategia)
  }, [cargar, estrategia])

  const cambiarEstrategia = (nueva: Estrategia) => {
    if (nueva === estrategia) return
    haptics.light()
    guardarEstrategia(nueva)
    setDesempate({})
    setEstrategia(nueva)
  }

  /** Manual, optional tie-break: it only reorders rows that share the same rank. */
  const mover = (fila: PlanFila, delta: number) => {
    const clave = claveGrupo(fila)
    const delGrupo = plan.filter((f) => claveGrupo(f) === clave).map((f) => f.prestamo_id)
    const actual = desempate[clave] ?? delGrupo
    const desde = actual.indexOf(fila.prestamo_id)
    const hasta = desde + delta
    if (desde < 0 || hasta < 0 || hasta >= actual.length) return
    const nuevo = [...actual]
    const movido = nuevo[desde]
    nuevo[desde] = nuevo[hasta]
    nuevo[hasta] = movido
    haptics.light()
    setDesempate((previo) => ({ ...previo, [clave]: nuevo }))
  }

  const planOrdenado = useMemo(() => {
    const rangoManual = (fila: PlanFila) => {
      const orden = desempate[claveGrupo(fila)]
      if (!orden) return Number.MAX_SAFE_INTEGER
      const indice = orden.indexOf(fila.prestamo_id)
      return indice < 0 ? Number.MAX_SAFE_INTEGER : indice
    }
    return [...plan].sort((a, b) => {
      if (a.moneda !== b.moneda) return a.moneda < b.moneda ? -1 : 1
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad
      const manual = rangoManual(a) - rangoManual(b)
      if (manual !== 0 && Number.isFinite(manual)) return manual
      return a.prestamo_id - b.prestamo_id
    })
  }, [plan, desempate])

  const monedas = useMemo(() => {
    const vistas: string[] = []
    for (const fila of planOrdenado) {
      if (!vistas.includes(fila.moneda)) vistas.push(fila.moneda)
    }
    return vistas
  }, [planOrdenado])

  const simular = async (fila: PlanFila) => {
    const monto = Number(montos[fila.prestamo_id])
    if (!Number.isFinite(monto) || monto <= 0) {
      showToast(t('prestamos_pago_error_monto'), 'error')
      return
    }
    try {
      const resultado = await rpc<SimulacionPrestamo>('fn_saneamiento_simular', {
        p_prestamo_id: fila.prestamo_id,
        p_monto: monto,
      })
      if (!resultado) return
      setSimulacion({ fila, resultado })
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  return (
    <div className="prestamos-plan">
      <p className="prestamos-hint">{t('prestamos_saneamiento_subtitulo')}</p>

      <section className="prestamos-bloque">
        <h2 className="font-display">{t('prestamos_saneamiento_progreso_titulo')}</h2>
        {progreso.length === 0 ? (
          <p className="prestamos-hint">{t('prestamos_saneamiento_progreso_sin_datos')}</p>
        ) : (
          <ul className="prestamos-moneda-lista">
              {progreso.map((fila) => {
                const porcentaje = numero(fila.porcentaje)
                return (
                  <li key={fila.moneda} className="prestamos-moneda-row">
                    <span className="prestamos-moneda-chip">{fila.moneda}</span>
                    <div className="prestamos-moneda-datos">
                      <span className="prestamos-saldo-label">
                        {t('prestamos_saneamiento_progreso_pendiente')}
                      </span>
                      <strong className="prestamos-moneda-monto">
                        {montoONoCalculable(numero(fila.saldo_pendiente), fila.moneda)}
                      </strong>
                      <span className="prestamos-hint">
                        {t('prestamos_saneamiento_progreso_pagado')}:{' '}
                        {montoONoCalculable(numero(fila.pagado_registrado), fila.moneda)}
                      </span>
                      <span className="prestamos-hint">
                        {t('prestamos_saneamiento_progreso_activos', { count: fila.prestamos_activos })}
                      </span>
                    </div>
                    <div className="prestamos-moneda-conteo">
                      <span>
                        {t('prestamos_saneamiento_progreso_fin')}:{' '}
                        {fila.fecha_fin_estimada
                          ? fechaOTexto(fila.fecha_fin_estimada, 'prestamos_lista_sin_vencimiento')
                          : t('prestamos_saneamiento_no_calculable')}
                      </span>
                      {/* Un porcentaje que no se pudo calcular se dice, no se dibuja como 0 % (S19). */}
                      {porcentaje !== null ? (
                        <span>{formatPercent(porcentaje, { signed: false })}</span>
                      ) : (
                        <span className="prestamos-no-calculable">
                          {t('prestamos_saneamiento_no_calculable')}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
          </ul>
        )}
        {progreso.some((fila) => !fila.fecha_fin_estimada) && (
          <p className="prestamos-nota">{t('prestamos_saneamiento_progreso_sin_fecha_motivo')}</p>
        )}
      </section>

      <div className="prestamos-estrategias" role="group" aria-label={t('prestamos_saneamiento_estrategia')}>
        {ESTRATEGIAS.map((opcion) => (
          <button
            key={opcion.key}
            type="button"
            className={`prestamos-estrategia ${estrategia === opcion.key ? 'is-activo' : ''}`}
            aria-pressed={estrategia === opcion.key}
            onClick={() => cambiarEstrategia(opcion.key)}
          >
            <strong>{t(opcion.label)}</strong>
            <span>{t(opcion.desc)}</span>
          </button>
        ))}
      </div>

      {estrategia === 'relationships' && !vinculosAbierto && (
        <button type="button" className="btn btn-outline btn-full" onClick={() => setVinculosAbierto(true)}>
          {t('prestamos_vinculos_abrir')}
        </button>
      )}

      {vinculosAbierto && (
        <VinculosCuestionario
          onCerrar={() => setVinculosAbierto(false)}
          onAplicado={() => {
            setVinculosAbierto(false)
            void cargar(estrategia)
          }}
        />
      )}

      {cargando ? (
        <div className="prestamos-loading-mini">
          <div className="spinner" />
          <p className="prestamos-hint">{t('prestamos_loading')}</p>
        </div>
      ) : error ? (
        <div className="prestamos-empty">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void cargar(estrategia)}>
            {t('prestamos_retry')}
          </button>
        </div>
      ) : planOrdenado.length === 0 ? (
        <div className="prestamos-empty">
          <span className="prestamos-empty-icon">🏆</span>
          <p>{t('prestamos_saneamiento_sin_deudas')}</p>
          <p className="prestamos-hint">{t('prestamos_saneamiento_sin_deudas_desc')}</p>
        </div>
      ) : (
        monedas.map((moneda) => (
          <section key={moneda} className="prestamos-plan-moneda">
            <h2 className="prestamos-subtitulo">{moneda}</h2>
            <ul className="prestamos-plan-lista">
              {planOrdenado
                .filter((fila) => fila.moneda === moneda)
                .map((fila) => {
                  const claveEstado = estadoKey(fila.estado_vencimiento)
                  const enEmpate = fila.comparte_prioridad
                  return (
                    <li key={fila.prestamo_id} className="prestamos-item">
                      <div className="prestamos-item-head">
                        <div className="prestamos-item-info">
                          <h3 className="prestamos-item-titulo">
                            <span className="prestamos-prioridad">
                              {t('prestamos_saneamiento_prioridad', { n: fila.prioridad })}
                            </span>{' '}
                            {fila.nombre}
                          </h3>
                          <p className="prestamos-hint">
                            {fila.contraparte} ·{' '}
                            {fila.es_personal
                              ? t('prestamos_saneamiento_personal')
                              : t('prestamos_saneamiento_institucional')}
                          </p>
                        </div>
                        <span className={`prestamos-badge ${estadoTono(fila.estado_vencimiento)}`}>
                          {textoEstadoVencimiento(fila.estado_vencimiento, claveEstado)}
                        </span>
                      </div>

                      <p className="prestamos-saldo-label">{t('prestamos_lista_saldo')}</p>
                      <strong className="prestamos-item-saldo">
                        {montoONoCalculable(numero(fila.saldo_pendiente), fila.moneda)}
                      </strong>

                      <p className="prestamos-item-meta">
                        {t('prestamos_lista_tasa')}: {tasaTexto(fila.tasa, fila.tasa_informada)}
                        {' · '}
                        {t('prestamos_lista_vencimiento')}:{' '}
                        {fechaOTexto(fila.proximo_vencimiento, 'prestamos_lista_sin_vencimiento')}
                        {estrategia === 'relationships' && numero(fila.puntos_vinculo) !== null && (
                          <> {' · '}{t('prestamos_saneamiento_puntos', { puntos: fila.puntos_vinculo })}</>
                        )}
                      </p>

                      {enEmpate && (
                        <div className="prestamos-empate">
                          <span className="prestamos-badge is-empate">{t('prestamos_saneamiento_empate')}</span>
                          <p className="prestamos-hint">{t('prestamos_saneamiento_empate_ayuda')}</p>
                          <div className="prestamos-empate-actions">
                            <button
                              type="button"
                              className="prestamos-chip"
                              onClick={() => mover(fila, -1)}
                              aria-label={t('prestamos_saneamiento_desempatar_sube')}
                            >
                              ↑ {t('prestamos_saneamiento_desempatar_sube')}
                            </button>
                            <button
                              type="button"
                              className="prestamos-chip"
                              onClick={() => mover(fila, 1)}
                              aria-label={t('prestamos_saneamiento_desempatar_baja')}
                            >
                              ↓ {t('prestamos_saneamiento_desempatar_baja')}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="prestamos-item-actions">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          className="prestamos-input"
                          placeholder={t('prestamos_saneamiento_simular_monto')}
                          value={montos[fila.prestamo_id] ?? ''}
                          onChange={(e) =>
                            setMontos((previo) => ({ ...previo, [fila.prestamo_id]: e.target.value }))
                          }
                        />
                        <button type="button" className="btn btn-primary" onClick={() => void simular(fila)}>
                          {t('prestamos_saneamiento_simular')}
                        </button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))
      )}

      {simulacion && (
        <SimulacionPrestamoModal
          fila={simulacion.fila}
          resultado={simulacion.resultado}
          onClose={() => setSimulacion(null)}
          onRegistrar={() => {
            const id = simulacion.fila.prestamo_id
            setSimulacion(null)
            navigate(`/prestamos/debo?prestamo=${id}`)
          }}
        />
      )}
    </div>
  )
}
