import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { RegistrarPagoModal } from './RegistrarPagoModal'
import { PrestamoDetalleView } from './PrestamoDetalle'
import {
  estadoKey,
  estadoTono,
  modalidadKey,
  type Direccion,
  type PrestamoListaItem,
  type PrestamoPagoTarget,
} from './types'
import { fechaOTexto, montoONoCalculable, tasaTexto, textoEstadoVencimiento } from './formato'
import './prestamos.css'

interface PrestamoListaProps {
  direccion: Direccion
}

/**
 * One list component for both directions (T24). The only differences between
 * «Debo» and «Me deben» are the copy of the quick action and the empty state:
 * the data, the query and the detail are the same shape.
 *
 * Debo and Me deben are never mixed: this component queries exactly one direction.
 */
export function PrestamoLista({ direccion }: PrestamoListaProps) {
  useFormatRevision()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [items, setItems] = useState<PrestamoListaItem[]>([])
  const [incluirSaldados, setIncluirSaldados] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagoTarget, setPagoTarget] = useState<PrestamoPagoTarget | null>(null)
  const [recargarToken, setRecargarToken] = useState(0)

  const esCobro = direccion === 'me_deben'
  const detalleId = useMemo(() => {
    const raw = searchParams.get('prestamo')
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  }, [searchParams])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const filas = await rpc<PrestamoListaItem[]>('fn_prestamos_listar', {
        p_direccion: direccion,
        p_incluir_saldados: incluirSaldados,
      })
      setItems(Array.isArray(filas) ? filas : [])
    } catch (err) {
      const mensaje = parseError(err) || t('error_generic')
      setError(mensaje)
      showToast(mensaje, 'error')
    } finally {
      setCargando(false)
    }
  }, [direccion, incluirSaldados, showToast])

  useEffect(() => {
    void cargar()
  }, [cargar, recargarToken])

  const abrirDetalle = (id: number) => {
    haptics.light()
    const siguiente = new URLSearchParams(searchParams)
    siguiente.set('prestamo', String(id))
    setSearchParams(siguiente, { replace: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cerrarDetalle = () => {
    haptics.light()
    const siguiente = new URLSearchParams(searchParams)
    siguiente.delete('prestamo')
    setSearchParams(siguiente, { replace: false })
  }

  const alRegistrar = useCallback(() => {
    setRecargarToken((n) => n + 1)
    window.dispatchEvent(new CustomEvent('movement-added'))
  }, [])

  if (detalleId !== null) {
    return (
      <div className="page prestamos-page fade-in">
        <PrestamoDetalleView
          prestamoId={detalleId}
          direccion={direccion}
          onVolver={cerrarDetalle}
          recargarToken={recargarToken}
          onRegistrar={setPagoTarget}
        />
        {pagoTarget && (
          <RegistrarPagoModal
            isOpen
            target={pagoTarget}
            onClose={() => setPagoTarget(null)}
            onSuccess={alRegistrar}
          />
        )}
      </div>
    )
  }

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">
            {t(esCobro ? 'prestamos_lista_me_deben_titulo' : 'prestamos_lista_debo_titulo')}
          </h1>
        </div>
      </header>

      <div className="prestamos-toolbar">
        <button type="button" className="prestamos-back" onClick={() => navigate('/prestamos')}>
          {t('prestamos_volver_prestamos')}
        </button>
        <label className="prestamos-toggle">
          <input
            type="checkbox"
            checked={incluirSaldados}
            onChange={(e) => setIncluirSaldados(e.target.checked)}
          />
          <span>{t('prestamos_lista_incluir_saldados')}</span>
        </label>
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
      ) : items.length === 0 ? (
        <div className="prestamos-empty">
          <span className="prestamos-empty-icon">🤝</span>
          <p>{t(esCobro ? 'prestamos_lista_vacio_me_deben' : 'prestamos_lista_vacio_debo')}</p>
        </div>
      ) : (
        <div className="prestamos-lista">
          {items.map((item) => (
            <PrestamoCard
              key={item.prestamo_id}
              item={item}
              esCobro={esCobro}
              onDetalle={() => abrirDetalle(item.prestamo_id)}
              onRegistrar={() =>
                setPagoTarget({
                  prestamo_id: item.prestamo_id,
                  nombre: item.nombre,
                  moneda: item.moneda,
                  saldo_pendiente: item.saldo_pendiente,
                  direccion: item.direccion,
                })
              }
            />
          ))}
        </div>
      )}

      {pagoTarget && (
        <RegistrarPagoModal
          isOpen
          target={pagoTarget}
          onClose={() => setPagoTarget(null)}
          onSuccess={alRegistrar}
        />
      )}
    </div>
  )
}

interface PrestamoCardProps {
  item: PrestamoListaItem
  esCobro: boolean
  onDetalle: () => void
  onRegistrar: () => void
}

function PrestamoCard({ item, esCobro, onDetalle, onRegistrar }: PrestamoCardProps) {
  const claveEstado = estadoKey(item.estado_vencimiento)
  const claveModalidad = modalidadKey(item.modalidad)
  // The backend already said «saldado»: nothing is left to pay or collect.
  const puedeRegistrar = item.estado_vencimiento !== 'saldado'

  return (
    <article className="prestamos-item">
      <div className="prestamos-item-head">
        <div className="prestamos-item-info">
          <h3 className="prestamos-item-titulo">{item.nombre}</h3>
          <p className="prestamos-hint">{item.contraparte}</p>
        </div>
        <span className={`prestamos-badge ${estadoTono(item.estado_vencimiento)}`}>
          {textoEstadoVencimiento(item.estado_vencimiento, claveEstado)}
        </span>
      </div>

      <p className="prestamos-saldo-label">{t('prestamos_lista_saldo')}</p>
      <strong className="prestamos-item-saldo">
        {montoONoCalculable(item.saldo_pendiente, item.moneda)}
      </strong>

      <p className="prestamos-item-meta">
        {t('prestamos_lista_tasa')}: {tasaTexto(item.tasa, item.tasa_informada)}
        {' · '}
        {t('prestamos_lista_vencimiento')}:{' '}
        {fechaOTexto(item.proximo_vencimiento, 'prestamos_lista_sin_vencimiento')}
        {claveModalidad && <> {' · '}{t(claveModalidad)}</>}
      </p>

      <div className="prestamos-item-actions">
        <button type="button" className="btn btn-ghost" onClick={onDetalle}>
          {t('prestamos_lista_ver_detalle')}
        </button>
        {puedeRegistrar && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              haptics.light()
              onRegistrar()
            }}
          >
            {t(esCobro ? 'prestamos_lista_registrar_cobro' : 'prestamos_lista_registrar_pago')}
          </button>
        )}
      </div>
    </article>
  )
}
