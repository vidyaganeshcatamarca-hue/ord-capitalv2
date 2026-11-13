import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ArrowDownUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { SobreCard } from '@/components/sobres/SobreCard'
import { SobreDetail, sobreDesdeDetalle } from '@/components/sobres/SobreDetail'
import { SobreFormModal } from '@/components/sobres/SobreFormModal'
import { SobreAporteModal } from '@/components/sobres/SobreAporteModal'
import { SobreRescateModal } from '@/components/sobres/SobreRescateModal'
import { SobreRendimientoModal } from '@/components/sobres/SobreRendimientoModal'
import { useOrdenArrastre } from '@/components/sobres/useOrdenArrastre'
import { SobreMovimientoModal } from '@/components/sobres/SobreMovimientoModal'
import {
  normalizarBilletera,
  normalizarDetalle,
  normalizarSobre,
  type BilleteraOperativa,
  type Sobre,
  type SobreDetalle,
  type SobreMovimiento,
} from '@/components/sobres/types'
import './SobresPage.css'

type Vista = 'activos' | 'archivados' | 'detalle'

export function SobresPage() {
  const { showToast } = useToast()

  const [vista, setVista] = useState<Vista>('activos')
  const [activos, setActivos] = useState<Sobre[]>([])
  const [archivados, setArchivados] = useState<Sobre[]>([])
  const [detalle, setDetalle] = useState<SobreDetalle | null>(null)
  const [billeteras, setBilleteras] = useState<BilleteraOperativa[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formTarget, setFormTarget] = useState<Sobre | 'nuevo' | null>(null)
  const [aporteTarget, setAporteTarget] = useState<Sobre | null>(null)
  const [rescateTarget, setRescateTarget] = useState<Sobre | null>(null)
  const [archivoTarget, setArchivoTarget] = useState<Sobre | null>(null)
  const [desarchivando, setDesarchivando] = useState<number | null>(null)
  const [rendimientoTarget, setRendimientoTarget] = useState<Sobre | null>(null)
  const [movimientoTarget, setMovimientoTarget] = useState<SobreMovimiento | null>(null)

  const cargarTodo = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [activosRes, archivadosRes, billeterasRes] = await Promise.all([
        supabase.rpc('fn_sobres_listar', { p_incluir_archivados: false }),
        supabase.rpc('fn_sobres_listar', { p_incluir_archivados: true }),
        supabase.rpc('fn_obtener_billeteras_activas'),
      ])
      if (activosRes.error) throw activosRes.error
      if (archivadosRes.error) throw archivadosRes.error
      if (billeterasRes.error) throw billeterasRes.error

      const listaActivos = (Array.isArray(activosRes.data) ? activosRes.data : []).map(normalizarSobre)
      const listaTodos = (Array.isArray(archivadosRes.data) ? archivadosRes.data : []).map(normalizarSobre)

      setActivos(listaActivos)
      setArchivados(listaTodos.filter((s) => s.archivado_at !== null))
      setBilleteras(
        (Array.isArray(billeterasRes.data) ? billeterasRes.data : [])
          .map(normalizarBilletera)
          .filter((b) => !b.es_fondo_prevision),
      )

      setDetalle((actual) => {
        if (!actual) return actual
        const sigue = listaTodos.find((s) => s.sobre_id === actual.sobre.sobre_id)
        return sigue ? actual : null
      })
    } catch (err) {
      const mensaje = parseError(err) || t('error_generic')
      setError(mensaje)
      showToast(mensaje, 'error')
    } finally {
      setCargando(false)
    }
  }, [showToast])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  const abrirDetalle = useCallback(
    async (sobre: Sobre) => {
      haptics.light()
      try {
        const { data, error: rpcError } = await supabase.rpc('fn_sobre_detalle', { p_sobre_id: sobre.sobre_id })
        if (rpcError) throw rpcError
        setDetalle(normalizarDetalle(data))
        setVista('detalle')
      } catch (err) {
        showToast(parseError(err), 'error')
      }
    },
    [showToast],
  )

  const recargarDetalle = useCallback(async () => {
    if (!detalle) return
    const { data, error: rpcError } = await supabase.rpc('fn_sobre_detalle', {
      p_sobre_id: detalle.sobre.sobre_id,
    })
    if (rpcError) {
      showToast(parseError(rpcError), 'error')
      return
    }
    setDetalle(normalizarDetalle(data))
  }, [detalle, showToast])

  const trasCambio = useCallback(async () => {
    await cargarTodo()
    await recargarDetalle()
  }, [cargarTodo, recargarDetalle])

  const confirmarArchivado = useCallback(async () => {
    if (!archivoTarget) return
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobre_archivar', { p_sobre_id: archivoTarget.sobre_id })
      if (rpcError) throw rpcError
      showToast(t('sobres_archived_toast'), 'success')
      haptics.success()
      setArchivoTarget(null)
      setVista('activos')
      setDetalle(null)
      await cargarTodo()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
      setArchivoTarget(null)
    }
  }, [archivoTarget, cargarTodo, showToast])

  const desarchivar = useCallback(
    async (sobre: Sobre) => {
      haptics.light()
      setDesarchivando(sobre.sobre_id)
      try {
        const { error: rpcError } = await supabase.rpc('fn_sobre_desarchivar', { p_sobre_id: sobre.sobre_id })
        if (rpcError) throw rpcError
        showToast(t('sobres_unarchived_toast'), 'success')
        haptics.success()
        await cargarTodo()
      } catch (err) {
        showToast(parseError(err), 'error')
        haptics.error()
      } finally {
        setDesarchivando(null)
      }
    },
    [cargarTodo, showToast],
  )

  const persistirOrden = useCallback(
    async (sobreIds: number[]) => {
      const { error: rpcError } = await supabase.rpc('fn_sobres_reordenar', { p_sobre_ids: sobreIds })
      if (rpcError) {
        showToast(parseError(rpcError), 'error')
        haptics.error()
        return false
      }
      haptics.success()
      await cargarTodo()
      return true
    },
    [cargarTodo, showToast],
  )

  const volverAlOrdenAutomatico = useCallback(async () => {
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobres_orden_automatico')
      if (rpcError) throw rpcError
      haptics.success()
      await cargarTodo()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    }
  }, [cargarTodo, showToast])

  const { ordenados, contenedor, propsItem } = useOrdenArrastre({
    sobres: activos,
    onPersistir: persistirOrden,
  })

  // El formato de moneda sale de la configuración regional: sin esto el resumen
  // SAVED queda con el formato del primer render y no coincide con la tarjeta.
  useFormatRevision()

  const hayOrdenManual = useMemo(() => activos.some((sobre) => sobre.orden_manual), [activos])

  /** Totales por moneda: nunca sumar ARS y USD como si fueran una unidad (CA-29). */
  const resumenPorMoneda = useMemo(() => {
    const mapa = new Map<string, { total: number; cantidad: number }>()
    for (const sobre of activos) {
      const actual = mapa.get(sobre.moneda) ?? { total: 0, cantidad: 0 }
      mapa.set(sobre.moneda, { total: actual.total + sobre.saldo, cantidad: actual.cantidad + 1 })
    }
    return Array.from(mapa.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [activos])

  if (cargando && activos.length === 0 && archivados.length === 0) {
    return (
      <main className="page sobres-page sobres-page--centro" aria-busy="true">
        <div className="sobres-spinner" aria-hidden="true" />
        <p>{t('loading')}</p>
      </main>
    )
  }

  if (error && activos.length === 0) {
    return (
      <main className="page sobres-page sobres-page--centro" role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={cargarTodo}>
          {t('btn_retry')}
        </button>
      </main>
    )
  }

  return (
    <main className="page sobres-page">
      <header className="sobres-header">
        <div className="sobres-header-texto">
          <p className="sobres-kicker">{t('menu_sobres')}</p>
          <h1>{t('sobres_title')}</h1>
          <p>{t('sobres_subtitle')}</p>
        </div>
        {vista === 'activos' && activos.length > 0 && (
          <div className="sobres-header-acciones">
            <button type="button" className="btn btn-primary" onClick={() => setFormTarget('nuevo')}>
              {t('sobres_new')}
            </button>
          </div>
        )}
      </header>

      {vista === 'detalle' && detalle ? (
        <SobreDetail
          detalle={detalle}
          onBack={() => {
            setVista('activos')
            setDetalle(null)
          }}
          onProvision={setAporteTarget}
          onRescue={setRescateTarget}
          onEdit={setFormTarget}
          onCorrect={setMovimientoTarget}
        />
      ) : vista === 'archivados' ? (
        <section className="sobres-archivados">
          <div className="sobres-archivados-encabezado">
            <h2>{t('sobres_archived_title')}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setVista('activos')}>
              {t('btn_back')}
            </button>
          </div>
          <p className="sobres-archivados-nota">{t('sobres_archived_note')}</p>
          {archivados.length === 0 ? (
            <p className="sobres-vacio-texto">{t('sobres_archived_empty')}</p>
          ) : (
            <ul className="sobres-archivados-lista">
              {archivados.map((sobre) => (
                <li key={sobre.sobre_id}>
                  <div>
                    <strong>{sobre.nombre}</strong>
                    <small>
                      {sobre.archivado_at ? formatDate(sobre.archivado_at) : ''}
                      {sobre.monto_meta !== null
                        ? ` · ${t('sobres_goal_amount')} ${formatCurrency(sobre.monto_meta, sobre.moneda)}`
                        : ''}
                    </small>
                  </div>
                  <div className="sobres-archivados-saldo">
                    <span>{formatCurrency(sobre.saldo, sobre.moneda)}</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => desarchivar(sobre)}
                      disabled={desarchivando === sobre.sobre_id}
                    >
                      <ArchiveRestore size={14} aria-hidden /> {t('sobres_unarchive')}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => abrirDetalle(sobre)}>
                      {t('sobres_detail')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : activos.length === 0 ? (
        <section className="sobres-vacio">
          <h2>{t('sobres_empty_title')}</h2>
          <p className="sobres-vacio-texto">{t('sobres_empty_text')}</p>
          <button type="button" className="btn btn-primary" onClick={() => setFormTarget('nuevo')}>
            {t('sobres_new')}
          </button>
          {archivados.length > 0 && (
            <button type="button" className="sobres-vacio-enlace" onClick={() => setVista('archivados')}>
              {t('sobres_archived_link')}
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="sobres-resumen" aria-label={t('sobres_title')}>
            {resumenPorMoneda.map(([moneda, { total, cantidad }]) => (
              <article key={moneda}>
                <span>{t('sobres_saved')}</span>
                <strong>{formatCurrency(total, moneda)}</strong>
                <small>
                  {cantidad === 1
                    ? t('sobres_active_count_one')
                    : t('sobres_active_count', { cantidad })}
                </small>
              </article>
            ))}
          </section>

          <div className="sobres-orden">
            {hayOrdenManual ? (
              <button type="button" className="sobres-orden-auto" onClick={volverAlOrdenAutomatico}>
                <ArrowDownUp size={14} />
                {t('sobres_order_auto')}
              </button>
            ) : (
              activos.length > 1 && <span className="sobres-orden-hint">{t('sobres_order_hint')}</span>
            )}
          </div>

          <section className="sobres-lista" ref={contenedor}>
            {ordenados.map((sobre) => (
              <div key={sobre.sobre_id} {...propsItem(sobre)}>
                <SobreCard
                  sobre={sobre}
                  onSelect={abrirDetalle}
                  onProvision={setAporteTarget}
                  onRescue={setRescateTarget}
                  onEdit={setFormTarget}
                  onArchive={setArchivoTarget}
                  onYield={setRendimientoTarget}
                />
              </div>
            ))}
          </section>

          {archivados.length > 0 && (
            <button type="button" className="sobres-enlace-archivados" onClick={() => setVista('archivados')}>
              <Archive size={14} />
              {t('sobres_archived_link')}
            </button>
          )}
        </>
      )}

      <SobreFormModal
        isOpen={formTarget !== null}
        sobre={formTarget === null || formTarget === 'nuevo' ? null : formTarget}
        billeteras={billeteras}
        onClose={() => setFormTarget(null)}
        onSuccess={trasCambio}
      />

      <SobreAporteModal
        isOpen={aporteTarget !== null}
        sobre={aporteTarget}
        billeteras={billeteras}
        onClose={() => setAporteTarget(null)}
        onSuccess={trasCambio}
      />

      <SobreRescateModal
        isOpen={rescateTarget !== null}
        sobre={rescateTarget}
        onClose={() => setRescateTarget(null)}
        onSuccess={trasCambio}
      />

      <SobreMovimientoModal
        isOpen={movimientoTarget !== null}
        movimiento={movimientoTarget}
        moneda={detalle?.sobre.moneda ?? ''}
        billeteras={billeteras}
        onClose={() => setMovimientoTarget(null)}
        onSuccess={trasCambio}
      />

      <SobreRendimientoModal
        isOpen={rendimientoTarget !== null}
        sobre={rendimientoTarget}
        onClose={() => setRendimientoTarget(null)}
        onSuccess={trasCambio}
      />

      <ConfirmModal
        isOpen={archivoTarget !== null}
        title={t('sobres_archive_confirm_title')}
        message={t('sobres_archive_confirm_message')}
        confirmText={t('sobres_archive')}
        cancelText={t('btn_cancel')}
        type="danger"
        onConfirm={confirmarArchivado}
        onCancel={() => setArchivoTarget(null)}
      />
    </main>
  )
}

export default SobresPage
