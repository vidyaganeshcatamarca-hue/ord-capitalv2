import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatDate } from '@/lib/format'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { numero, rutaPorDireccion, type EventoCalendarioPrestamo } from './types'
import { montoONoCalculable } from './formato'
import './prestamos.css'

const RANGOS = [30, 60, 90] as const

/**
 * Loan events of the calendar (S20, S24).
 *
 * The loan is identified by the `prestamo_id` COLUMN: the contract carries
 * `prestamo_id` and `cuota_id` explicitly, so nothing here ever parses an
 * `evento_id` string. The calendar is not the authority for any balance: it
 * opens the loan, and the payment happens there, through the same single path.
 */
export function PrestamosCalendario() {
  useFormatRevision()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [dias, setDias] = useState<number>(30)
  const [eventos, setEventos] = useState<EventoCalendarioPrestamo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const data = await rpc<EventoCalendarioPrestamo[]>('fn_prestamos_calendario', {
        p_dias_adelante: dias,
      })
      setEventos(Array.isArray(data) ? data : [])
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

  const porFecha = useMemo(() => {
    const mapa = new Map<string, EventoCalendarioPrestamo[]>()
    for (const evento of eventos) {
      const lista = mapa.get(evento.fecha) ?? []
      lista.push(evento)
      mapa.set(evento.fecha, lista)
    }
    return [...mapa.entries()]
  }, [eventos])

  const abrirPrestamo = (prestamoId: number, direccion: string) => {
    if (!prestamoId) return
    haptics.light()
    navigate(`${rutaPorDireccion(direccion)}?prestamo=${prestamoId}`)
  }

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_calendario_titulo')}</h1>
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
                  <li key={`${evento.prestamo_id}-${evento.cuota_id ?? evento.fecha}`} className="prestamos-evento">
                    <div className="prestamos-evento-info">
                      <strong className="prestamos-evento-nombre">{evento.nombre}</strong>
                      <span className="prestamos-hint">
                        {evento.numero_cuota != null
                          ? t('prestamos_calendario_cuota', { n: evento.numero_cuota })
                          : t(evento.direccion === 'me_deben' ? 'prestamos_menu_me_deben' : 'prestamos_menu_debo')}
                      </span>
                      <div className="prestamos-evento-badges">
                        <span className={`prestamos-badge ${evento.pagado ? 'is-saldado' : 'is-proximo'}`}>
                          {t(evento.pagado ? 'prestamos_calendario_pagado' : 'prestamos_calendario_pendiente')}
                        </span>
                        {!evento.pagado && evento.criticidad === 'vencido' && (
                          <span className="prestamos-badge is-vencido">{t('prestamos_calendario_vencido')}</span>
                        )}
                        {!evento.pagado && (evento.criticidad === 'critico' || evento.criticidad === 'atencion') && (
                          <span className="prestamos-badge is-proximo">{t('prestamos_calendario_critico')}</span>
                        )}
                      </div>
                    </div>
                    <div className="prestamos-evento-monto">
                      <strong>{montoONoCalculable(numero(evento.monto), evento.moneda)}</strong>
                      <button
                        type="button"
                        className="prestamos-evento-link"
                        onClick={() => abrirPrestamo(evento.prestamo_id, evento.direccion)}
                      >
                        {t('prestamos_calendario_ver_prestamo')}
                      </button>
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
