import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, HandCoins, HeartHandshake, Scale, TrendingDown } from 'lucide-react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { ContextoFormatoPrestamos } from '@/components/prestamos/ContextoFormatoPrestamos'
import { type PrestamoResumenFila } from '@/components/prestamos/types'
import { montoONoCalculable } from '@/components/prestamos/formato'
import { PrestamoFormModal } from '@/components/prestamos/PrestamoFormModal'
import '@/components/prestamos/prestamos.css'

const SECCIONES = [
  {
    path: '/prestamos/debo',
    label: 'prestamos_menu_debo',
    desc: 'prestamos_menu_debo_desc',
    icon: TrendingDown,
  },
  {
    path: '/prestamos/me-deben',
    label: 'prestamos_menu_me_deben',
    desc: 'prestamos_menu_me_deben_desc',
    icon: HandCoins,
  },
  {
    path: '/prestamos/saneamiento',
    label: 'prestamos_menu_saneamiento',
    desc: 'prestamos_menu_saneamiento_desc',
    icon: Scale,
  },
  {
    path: '/prestamos/calendario',
    label: 'prestamos_menu_calendario',
    desc: 'prestamos_menu_calendario_desc',
    icon: CalendarDays,
  },
  {
    path: '/prestamos/pareja',
    label: 'prestamos_menu_pareja',
    desc: 'prestamos_menu_pareja_desc',
    icon: HeartHandshake,
  },
] as const

/**
 * Loans home (S1): the two balances side by side and per currency, never netted
 * and never summed across currencies, plus the access to the five sections.
 */
export function PrestamosPage() {
  useFormatRevision()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [filas, setFilas] = useState<PrestamoResumenFila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const data = await rpc<PrestamoResumenFila[]>('fn_prestamos_resumen')
      setFilas(Array.isArray(data) ? data : [])
    } catch (err) {
      const mensaje = parseError(err) || t('error_generic')
      setError(mensaje)
      showToast(mensaje, 'error')
    } finally {
      setCargando(false)
    }
  }, [showToast])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Two separate universes: each block only ever sees its own direction.
  const debo = filas.filter((f) => f.direccion === 'debo')
  const meDeben = filas.filter((f) => f.direccion === 'me_deben')

  return (
    <div className="page prestamos-page fade-in">
      <ContextoFormatoPrestamos />
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_title')}</h1>
          <p className="prestamos-hint">{t('prestamos_subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            haptics.light()
            setAltaAbierta(true)
          }}
        >
          {t('prestamos_alta_abrir')}
        </button>
      </header>

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
      ) : (
        <section className="prestamos-resumen" aria-label={t('prestamos_resumen_titulo')}>
          <BalanceBloque
            titulo={t('prestamos_resumen_debo')}
            filas={debo}
            vacio={t('prestamos_resumen_vacio')}
            onAbrir={() => navigate('/prestamos/debo')}
          />
          <BalanceBloque
            titulo={t('prestamos_resumen_me_deben')}
            filas={meDeben}
            vacio={t('prestamos_resumen_vacio')}
            onAbrir={() => navigate('/prestamos/me-deben')}
          />
          <p className="prestamos-nota">{t('prestamos_resumen_regla')}</p>
        </section>
      )}

      <nav className="prestamos-secciones" aria-label={t('prestamos_title')}>
        {SECCIONES.map((seccion) => {
          const Icono = seccion.icon
          return (
            <button
              key={seccion.path}
              type="button"
              className="prestamos-seccion"
              onClick={() => {
                haptics.light()
                navigate(seccion.path)
              }}
            >
              <span className="prestamos-seccion-icon">
                <Icono size={20} strokeWidth={1.8} />
              </span>
              <span className="prestamos-seccion-texto">
                <strong>{t(seccion.label)}</strong>
                <span>{t(seccion.desc)}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <PrestamoFormModal
        isOpen={altaAbierta}
        direccionInicial="debo"
        onClose={() => setAltaAbierta(false)}
        onSuccess={() => void cargar()}
      />
    </div>
  )
}

interface BalanceBloqueProps {
  titulo: string
  filas: PrestamoResumenFila[]
  vacio: string
  onAbrir: () => void
}

/**
 * One direction, one block. Amounts of different currencies are never added:
 * each currency keeps its own line (S3, S15).
 */
function BalanceBloque({ titulo, filas, vacio, onAbrir }: BalanceBloqueProps) {
  return (
    <div className="prestamos-bloque">
      <div className="prestamos-bloque-head">
        <h2 className="font-display">{titulo}</h2>
        <button type="button" className="prestamos-bloque-link" onClick={onAbrir}>
          {t('prestamos_menu_ver_todas')}
        </button>
      </div>
      {filas.length === 0 ? (
        <p className="prestamos-hint">{vacio}</p>
      ) : (
        <ul className="prestamos-moneda-lista">
          {filas.map((fila) => (
            <li key={`${fila.direccion}-${fila.moneda}`} className="prestamos-moneda-row">
              <span className="prestamos-moneda-chip">{fila.moneda}</span>
              <div className="prestamos-moneda-datos">
                <span className="prestamos-saldo-label">{t('prestamos_resumen_pendiente')}</span>
                <strong className="prestamos-moneda-monto">
                  {montoONoCalculable(fila.pendiente, fila.moneda)}
                </strong>
                <span className="prestamos-hint">
                  {t('prestamos_resumen_pagado')}: {montoONoCalculable(fila.pagado_registrado, fila.moneda)}
                </span>
              </div>
              <div className="prestamos-moneda-conteo">
                <span>{t('prestamos_resumen_activos', { count: fila.prestamos_activos })}</span>
                <span>{t('prestamos_resumen_saldados', { count: fila.prestamos_saldados })}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PrestamosPage
