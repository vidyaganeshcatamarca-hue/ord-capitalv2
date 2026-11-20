import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useHogar } from '@/contexts/HogarContext'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { formatCurrencyNumber } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { numero } from '@/components/prestamos/types'
import '@/components/prestamos/prestamos.css'

/**
 * Row of `fn_reporte_hogar_balances()`. The function returns AT MOST one row: the
 * net shared-expense balance of the household, already net of the last settlement
 * and already applying the percentages saved on each expense. It does not touch
 * `p_prestamos`.
 */
interface BalanceHogarRow {
  user_id_deudor: number | null
  nombre_deudor: string | null
  user_id_acreedor: number | null
  nombre_acreedor: string | null
  monto_deuda: number | null
}

/**
 * Partner section (T21, S30, S31).
 *
 * Two groups, always, never merged and never netted:
 *   1. the shared-expense balance, read from `fn_reporte_hogar_balances()`;
 *   2. the explicit loans between the two members.
 *
 * Group 2 is NOT rendered with data. `p_prestamos.contraparte_user_id` exists and the
 * write functions persist it (`fn_prestamo_crear`, `fn_prestamo_editar`), but no read
 * function projects it: `fn_prestamos_listar` has no such column and
 * `fn_prestamo_detalle` does not include it in its jsonb. Deriving the group by
 * matching `entidad_nombre` against the partner's name would be inventing a link the
 * database does not claim, so the group says what is missing instead.
 *
 * Nothing here filters by owner: the read functions already enforce privacy.
 */
export function PrestamosParejaPage() {
  useFormatRevision()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { estado: estadoHogar, loading: cargandoHogar } = useHogar()

  const [balances, setBalances] = useState<BalanceHogarRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tieneHogar = Boolean(estadoHogar?.tiene_hogar)

  const cargar = useCallback(async () => {
    // No household means no shared expenses to read, and the RPC would only return
    // an empty set. The empty state is decided by the household, not by the row count.
    if (!tieneHogar) {
      setBalances([])
      setError(null)
      setCargando(false)
      return
    }

    setCargando(true)
    setError(null)
    try {
      const data = await rpc<BalanceHogarRow[]>('fn_reporte_hogar_balances')
      setBalances(Array.isArray(data) ? data : [])
    } catch (err) {
      const mensaje = parseError(err) || t('error_generic')
      setError(mensaje)
      showToast(mensaje, 'error')
    } finally {
      setCargando(false)
    }
  }, [showToast, tieneHogar])

  useEffect(() => {
    if (cargandoHogar) return
    void cargar()
  }, [cargar, cargandoHogar])

  const cargandoTodo = cargandoHogar || cargando

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_pareja_titulo')}</h1>
          <p className="prestamos-hint">{t('prestamos_pareja_subtitulo')}</p>
        </div>
      </header>

      <div className="prestamos-toolbar">
        <button
          type="button"
          className="prestamos-back"
          onClick={() => {
            haptics.light()
            navigate('/prestamos')
          }}
        >
          {t('prestamos_volver_prestamos')}
        </button>
      </div>

      <section className="prestamos-resumen" aria-label={t('prestamos_pareja_titulo')}>
        {/* Grupo 1: balance de gastos compartidos */}
        <div className="prestamos-bloque">
          <div className="prestamos-bloque-head">
            <h2 className="font-display">{t('prestamos_pareja_gastos_titulo')}</h2>
          </div>

          {cargandoTodo ? (
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
          ) : !tieneHogar ? (
            <p className="prestamos-hint">{t('prestamos_pareja_gastos_sin_hogar')}</p>
          ) : balances.length === 0 ? (
            <p className="prestamos-hint">{t('prestamos_pareja_gastos_sin_deuda')}</p>
          ) : (
            <ul className="prestamos-moneda-lista">
              {balances.map((fila) => (
                <li
                  key={`${fila.user_id_deudor}-${fila.user_id_acreedor}`}
                  className="prestamos-moneda-row"
                >
                  <div className="prestamos-moneda-datos">
                    <span className="prestamos-saldo-label">
                      {t('prestamos_pareja_gastos_debe', {
                        deudor: fila.nombre_deudor || t('prestamos_pareja_integrante'),
                        acreedor: fila.nombre_acreedor || t('prestamos_pareja_integrante'),
                      })}
                    </span>
                    <strong className="prestamos-moneda-monto">
                      {montoSinMoneda(fila.monto_deuda)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!cargandoTodo && !error && tieneHogar && balances.length > 0 && (
            <p className="prestamos-nota">{t('prestamos_pareja_gastos_sin_moneda')}</p>
          )}
        </div>

        {/* Grupo 2: prestamos explicitos entre los dos integrantes */}
        <div className="prestamos-bloque">
          <div className="prestamos-bloque-head">
            <h2 className="font-display">{t('prestamos_pareja_prestamos_titulo')}</h2>
          </div>
          <p className="prestamos-hint">{t('prestamos_pareja_prestamos_pendiente')}</p>
          <p className="prestamos-nota">{t('prestamos_pareja_prestamos_motivo')}</p>
        </div>

        <p className="prestamos-nota">{t('prestamos_pareja_regla')}</p>
      </section>
    </div>
  )
}

/**
 * `fn_reporte_hogar_balances()` returns `monto_deuda` with no currency column, so the
 * amount is rendered without a symbol instead of stamping one the contract never
 * sent. Same rule as the calendar's currencyless amounts (S26).
 */
function montoSinMoneda(valor: number | null | undefined): string {
  const n = numero(valor)
  if (n === null) return t('prestamos_saneamiento_no_calculable')
  return formatCurrencyNumber(n)
}

export default PrestamosParejaPage
