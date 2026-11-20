import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatDate, getFormatContext } from '@/lib/format'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import {
  numero,
  rutaPorDireccion,
  type EventoCalendarioFinanciero,
  type EventoCalendarioPrestamo,
  type EventoCalendarioUnificado,
} from './types'
import { etiquetaEvento, montoEvento } from './formato'
import './prestamos.css'

const RANGOS = [30, 60, 90] as const

/** Display order inside one day: what you owe first, then cards, then recurring. */
const PESO_TIPO: Record<EventoCalendarioUnificado['tipo'], number> = {
  prestamo: 0,
  tarjeta: 1,
  recurrente: 2,
}

/**
 * Full financial calendar (S20, functional decision 17).
 *
 * Three sources, three identities, one chronological list:
 *   * loans come from `fn_prestamos_calendario`, and the loan is identified by the
 *     `prestamo_id` COLUMN — nothing here ever parses an `evento_id` string (S24);
 *   * card due dates and recurring expenses come from
 *     `fn_reporte_calendario_financiero`.
 *
 * The financial report also emits a legacy `cuota_prestamo` branch. It is dropped
 * on purpose: loans are already covered by their own call, so including it would
 * duplicate every installment — and its ids live in a different space.
 *
 * The calendar is not the authority of any balance: it opens the loan, and the
 * payment happens there, through the single path that already exists.
 *
 * Formatting comes from `lib/format.ts`, the one place that knows the active
 * locale and the local currency. Those helpers read a module-level context that
 * `useNumberFormat` publishes; this screen only SUBSCRIBES to it, the same way
 * `PrestamoLista` and `PrestamoDetalle` do. The publisher belongs to the module
 * entry point (`ContextoFormatoPrestamos`, mounted once per `/prestamos/*` route),
 * not to this screen: mounting a second one here used to be the only thing that
 * hydrated the context, so the other four sections kept formatting with the
 * `es-AR` default while this one changed — and that asymmetry looked like the
 * money had changed currency. One publisher per module, mounted at its root.
 *
 * `useFormatRevision` re-renders the screen whenever that context changes. One
 * date path (`formatDate`) and one money path (`montoMoneda`), no second ones
 * (S28).
 */
export function PrestamosCalendario() {
  // Re-renders on every format context change; publishing belongs to
  // `ContextoFormatoPrestamos`, mounted by the route that renders this screen.
  const revisionFormato = useFormatRevision()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [dias, setDias] = useState<number>(30)
  const [prestamos, setPrestamos] = useState<EventoCalendarioPrestamo[]>([])
  const [financieros, setFinancieros] = useState<EventoCalendarioFinanciero[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [filasPrestamos, filasFinancieras] = await Promise.all([
        rpc<EventoCalendarioPrestamo[]>('fn_prestamos_calendario', { p_dias_adelante: dias }),
        rpc<EventoCalendarioFinanciero[]>('fn_reporte_calendario_financiero', {
          p_dias_adelante: dias,
        }),
      ])
      setPrestamos(Array.isArray(filasPrestamos) ? filasPrestamos : [])
      setFinancieros(Array.isArray(filasFinancieras) ? filasFinancieras : [])
    } catch (err) {
      const mensaje = parseError(err) || t('error_generic')
      setError(mensaje)
      showToast(mensaje, 'error')
    } finally {
      setCargando(false)
    }
  }, [dias, showToast])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const eventos = useMemo<EventoCalendarioUnificado[]>(() => {
    // Read from the shared context, exactly like the rest of the module: a card
    // due date arrives expressed in the user's local currency.
    const monedaLocal = getFormatContext().localCurrency

    const dePrestamos: EventoCalendarioUnificado[] = prestamos.map((evento) => ({
      clave: `prestamo-${evento.prestamo_id}-${evento.cuota_id ?? 'unico'}`,
      fecha: evento.fecha,
      tipo: 'prestamo',
      nombre: evento.nombre,
      monto: numero(evento.monto),
      moneda: evento.moneda,
      formato: 'moneda',
      criticidad: evento.criticidad,
      pagado: Boolean(evento.pagado),
      // Read from the column, never derived from a string (S24).
      prestamo_id: evento.prestamo_id,
      direccion: evento.direccion,
      numero_cuota: evento.numero_cuota,
      moneda_sin_informar: false,
    }))

    const deFinancieros: EventoCalendarioUnificado[] = financieros
      .filter((evento) => evento.tipo_evento === 'vencimiento_tarjeta' || evento.tipo_evento === 'gasto_recurrente')
      .map((evento) => {
        const esTarjeta = evento.tipo_evento === 'vencimiento_tarjeta'
        return {
          clave: `${evento.tipo_evento}-${evento.evento_id}`,
          fecha: evento.fecha,
          tipo: esTarjeta ? 'tarjeta' : 'recurrente',
          // A recurring expense arrives either with the user's own name or with the
          // category key, which is resolved through the app dictionary (S27).
          nombre: etiquetaEvento(evento.nombre),
          monto: numero(evento.monto),
          moneda: esTarjeta ? monedaLocal : null,
          formato: esTarjeta ? 'moneda' : 'numero',
          criticidad: evento.criticidad,
          pagado: Boolean(evento.pagado),
          prestamo_id: null,
          direccion: null,
          numero_cuota: null,
          // The financial report returns no currency for a recurring expense and its
          // amount lives in the wallet that pays it, which is not necessarily the
          // user's local currency. Borrowing a symbol here would state something the
          // row cannot prove, so the amount is shown with an explicit note (S26).
          moneda_sin_informar: !esTarjeta,
        }
      })

    return [...dePrestamos, ...deFinancieros].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      if (PESO_TIPO[a.tipo] !== PESO_TIPO[b.tipo]) return PESO_TIPO[a.tipo] - PESO_TIPO[b.tipo]
      return a.nombre.localeCompare(b.nombre)
    })
    // `revisionFormato` entra en las dependencias porque la moneda local se lee
    // dentro del memo: sin esto, cambiarla dejaría los importes en la anterior.
  }, [prestamos, financieros, revisionFormato])

  const porFecha = useMemo(() => {
    const mapa = new Map<string, EventoCalendarioUnificado[]>()
    for (const evento of eventos) {
      const lista = mapa.get(evento.fecha) ?? []
      lista.push(evento)
      mapa.set(evento.fecha, lista)
    }
    return [...mapa.entries()]
  }, [eventos])

  const abrirPrestamo = (prestamoId: number | null, direccion: string | null) => {
    // No id, no navigation: an event that is not a loan cannot open a loan.
    if (!prestamoId) return
    haptics.light()
    navigate(`${rutaPorDireccion(direccion)}?prestamo=${prestamoId}`)
  }

  const etiquetaTipo = (tipo: EventoCalendarioUnificado['tipo']) => {
    if (tipo === 'tarjeta') return t('prestamos_calendario_tipo_tarjeta')
    if (tipo === 'recurrente') return t('prestamos_calendario_tipo_recurrente')
    return t('prestamos_calendario_tipo_prestamo')
  }

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_calendario_titulo')}</h1>
          <p className="prestamos-hint">{t('prestamos_calendario_subtitulo')}</p>
        </div>
      </header>

      <div className="prestamos-toolbar">
        <button type="button" className="prestamos-back" onClick={() => navigate('/prestamos')}>
          {t('prestamos_volver_prestamos')}
        </button>
        <div className="prestamos-chips" role="group" aria-label={t('prestamos_calendario_dias', { dias })}>
          {RANGOS.map((rango) => (
            <button
              key={rango}
              type="button"
              className={`prestamos-chip ${dias === rango ? 'is-activo' : ''}`}
              onClick={() => setDias(rango)}
            >
              {t('prestamos_calendario_dias', { dias: rango })}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="prestamos-loading-mini">
          <div className="spinner" />
          <p className="prestamos-hint">{t('prestamos_loading')}</p>
        </div>
      ) : error ? (
        <div className="prestamos-empty">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void cargar()}>
            {t('prestamos_retry')}
          </button>
        </div>
      ) : porFecha.length === 0 ? (
        <div className="prestamos-empty">
          <span className="prestamos-empty-icon">📅</span>
          <p>{t('prestamos_calendario_vacio')}</p>
        </div>
      ) : (
        <div className="prestamos-calendario">
          {porFecha.map(([fecha, lista]) => (
            <section key={fecha} className="prestamos-dia">
              <h2 className="prestamos-dia-fecha">{formatDate(fecha)}</h2>
              <ul className="prestamos-dia-lista">
                {lista.map((evento) => (
                  <li key={evento.clave} className="prestamos-evento">
                    <div className="prestamos-evento-info">
                      <span className={`prestamos-tipo-evento is-${evento.tipo}`}>
                        {etiquetaTipo(evento.tipo)}
                      </span>
                      <strong className="prestamos-evento-nombre">{evento.nombre}</strong>
                      <span className="prestamos-hint">
                        {evento.tipo === 'prestamo'
                          ? evento.numero_cuota != null
                            ? t('prestamos_calendario_cuota', { n: evento.numero_cuota })
                            : t(
                                evento.direccion === 'me_deben'
                                  ? 'prestamos_menu_me_deben'
                                  : 'prestamos_menu_debo',
                              )
                          : etiquetaTipo(evento.tipo)}
                      </span>
                      <div className="prestamos-evento-badges">
                        <span className={`prestamos-badge ${evento.pagado ? 'is-saldado' : 'is-proximo'}`}>
                          {t(evento.pagado ? 'prestamos_calendario_pagado' : 'prestamos_calendario_pendiente')}
                        </span>
                        {!evento.pagado && evento.criticidad === 'vencido' && (
                          <span className="prestamos-badge is-vencido">{t('prestamos_calendario_vencido')}</span>
                        )}
                        {!evento.pagado &&
                          (evento.criticidad === 'critico' || evento.criticidad === 'atencion') && (
                            <span className="prestamos-badge is-proximo">{t('prestamos_calendario_critico')}</span>
                          )}
                      </div>
                    </div>
                    <div className="prestamos-evento-monto">
                      <strong>{montoEvento(evento)}</strong>
                      {evento.moneda_sin_informar && evento.monto !== null && (
                        <span className="prestamos-evento-monto-nota">
                          {t('prestamos_calendario_moneda_sin_informar')}
                        </span>
                      )}
                      {evento.tipo === 'prestamo' && evento.prestamo_id !== null && (
                        <button
                          type="button"
                          className="prestamos-evento-link"
                          onClick={() => abrirPrestamo(evento.prestamo_id, evento.direccion)}
                        >
                          {t('prestamos_calendario_ver_prestamo')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="prestamos-nota">{t('prestamos_calendario_aviso')}</p>
    </div>
  )
}

export default PrestamosCalendario
