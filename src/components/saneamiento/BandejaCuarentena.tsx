import { useCallback, useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { EditarCuarentenaModal } from './EditarCuarentenaModal'
import { RechazarCuarentenaModal } from './RechazarCuarentenaModal'
import { ImageModal } from './ImageModal'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'

type FiltroOrigen = 'todos' | 'ocr' | 'recurrente' | 'voz'

interface BandejaCuarentenaProps {
  onVolver: () => void
  onChange: () => void
}

export function BandejaCuarentena({ onVolver, onChange }: BandejaCuarentenaProps) {
  const { showToast } = useToast()

  const [filtro, setFiltro] = useState<FiltroOrigen>('todos')
  const [items, setItems] = useState<CuarentenaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  const [itemEditar, setItemEditar] = useState<CuarentenaItem | null>(null)
  const [itemRechazar, setItemRechazar] = useState<CuarentenaItem | null>(null)
  const [imagenUrl, setImagenUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [showConfirmLote, setShowConfirmLote] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await rpc<CuarentenaItem[]>('fn_reporte_cuarentena_pendientes', { p_filtro_origen: filtro })
      setItems(res || [])
      setSeleccionados(new Set())
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [filtro, showToast])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const conteos = useMemo(() => ({
    todos: items.length,
    ocr: items.filter((i) => i.origen === 'ocr').length,
    recurrente: items.filter((i) => i.origen === 'recurrente').length,
    voz: items.filter((i) => i.origen === 'voz').length,
  }), [items])

  const toggleSeleccion = (id: number) => {
    const next = new Set(seleccionados)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSeleccionados(next)
  }

  const handleAprobarItem = async (item: CuarentenaItem) => {
    try {
      await rpc('fn_aprobar_cuarentena', { p_pendiente_id: item.pendiente_id })
      showToast(t('saneamiento_toast_aprobado'), 'success')
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleRechazarItem = async (motivo: string, nota: string) => {
    if (!itemRechazar) return
    try {
      await rpc('fn_rechazar_cuarentena', { p_pendiente_id: itemRechazar.pendiente_id })
      showToast(t('saneamiento_toast_rechazado'), 'success')
      setItemRechazar(null)
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleAprobarLote = async () => {
    if (seleccionados.size === 0) return
    try {
      await rpc('fn_aprobar_gastos_cuarentena_lote', { p_pendiente_ids: Array.from(seleccionados) })
      showToast(t('saneamiento_toast_aprobados_lote', { count: String(seleccionados.size) }), 'success')
      setShowConfirmLote(false)
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleGuardarEdicion = async (payload: {
    monto: number
    estructura_egreso_id: number
    fecha: string
    billetera_id: number
    detalle: string
  }) => {
    if (!itemEditar) return
    try {
      await rpc('fn_editar_gasto_cuarentena', {
        p_pendiente_id: itemEditar.pendiente_id,
        p_monto: payload.monto,
        p_estructura_egreso_id: payload.estructura_egreso_id,
        p_fecha: payload.fecha,
        p_billetera_id: payload.billetera_id,
        p_detalle: payload.detalle,
      })
      showToast(t('saneamiento_toast_editado'), 'success')
      setItemEditar(null)
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const verFoto = (metadata: Record<string, any>) => {
    const url = metadata?.image_url || metadata?.foto_url || metadata?.ticket_url
    if (url) setImagenUrl(url)
  }

  const escucharAudio = (metadata: Record<string, any>) => {
    const url = metadata?.audio_url
    if (url) setAudioUrl(url)
  }

  const filtros: { key: FiltroOrigen; label: string }[] = [
    { key: 'todos', label: t('saneamiento_filtro_todos') },
    { key: 'ocr', label: `📷 OCR (${conteos.ocr})` },
    { key: 'recurrente', label: `🔄 ${t('saneamiento_recurrentes')} (${conteos.recurrente})` },
    { key: 'voz', label: `🎙️ ${t('saneamiento_voz')} (${conteos.voz})` },
  ]

  return (
    <section className="saneamiento-seccion">
      <h2 className="saneamiento-seccion-titulo">{t('saneamiento_bandejawidget_titulo')}</h2>

      <div className="saneamiento-filtros">
        {filtros.map((f) => (
          <button
            key={f.key}
            className={`saneamiento-filtro-chip ${filtro === f.key ? 'active' : ''}`}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {seleccionados.size > 0 && (
        <div className="saneamiento-lote-bar">
          <span>{t('saneamiento_seleccionados', { count: String(seleccionados.size) })}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowConfirmLote(true)}>
            ✅ {t('saneamiento_aprobar_seleccion')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="saneamiento-loading-mini"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="saneamiento-empty">
          <span className="saneamiento-empty-icon">🎉</span>
          <h3>{t('saneamiento_bandejawidget_vacio_titulo')}</h3>
          <p>{t('saneamiento_bandejawidget_vacio_desc')}</p>
        </div>
      ) : (
        <div className="saneamiento-lista">
          {items.map((item) => (
            <div key={item.pendiente_id} className={`saneamiento-item ${seleccionados.has(item.pendiente_id) ? 'seleccionado' : ''}`}>
              <div className="saneamiento-item-main">
                <input
                  type="checkbox"
                  checked={seleccionados.has(item.pendiente_id)}
                  onChange={() => toggleSeleccion(item.pendiente_id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="saneamiento-item-info">
                  <div className="saneamiento-item-titulo">
                    <span>{item.categoria_icono || '🛒'}</span>
                    <span>{item.categoria_nombre || t('saneamiento_sin_categoria')}</span>
                    <OrigenBadge origen={item.origen} />
                  </div>
                  <p className="saneamiento-item-detalle">{item.detalle || t('saneamiento_sin_detalle')}</p>
                  <p className="saneamiento-item-meta">
                    {formatDate(item.fecha)} · {item.billetera_nombre || '-'}
                  </p>

                  {item.origen === 'ocr' && (
                    <button className="saneamiento-item-link" onClick={() => verFoto(item.metadata)}>
                      📷 {t('saneamiento_ver_foto')}
                    </button>
                  )}
                  {item.origen === 'voz' && (
                    <button className="saneamiento-item-link" onClick={() => escucharAudio(item.metadata)}>
                      🎧 {t('saneamiento_escuchar_audio')}
                    </button>
                  )}
                </div>
                <div className="saneamiento-item-monto">
                  <span className="font-mono font-bold">{formatCurrency(item.monto, 'ARS')}</span>
                </div>
              </div>

              <div className="saneamiento-item-actions">
                <button className="saneamiento-btn-editar" onClick={() => setItemEditar(item)}>
                  ✏️ {t('saneamiento_editar')}
                </button>
                <button className="saneamiento-btn-rechazar" onClick={() => setItemRechazar(item)}>
                  ❌ {t('saneamiento_rechazar')}
                </button>
                <button className="saneamiento-btn-aprobar" onClick={() => handleAprobarItem(item)}>
                  ✅ {t('saneamiento_aprobar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {itemEditar && (
        <EditarCuarentenaModal
          item={itemEditar}
          isOpen={true}
          onClose={() => setItemEditar(null)}
          onGuardar={handleGuardarEdicion}
        />
      )}

      {itemRechazar && (
        <RechazarCuarentenaModal
          item={itemRechazar}
          isOpen={true}
          onClose={() => setItemRechazar(null)}
          onConfirmar={handleRechazarItem}
        />
      )}

      {showConfirmLote && (
        <ConfirmModal
          isOpen={showConfirmLote}
          title={t('saneamiento_lote_titulo', { count: String(seleccionados.size) })}
          message={t('saneamiento_lote_mensaje', { count: String(seleccionados.size) })}
          confirmText={t('saneamiento_aprobar_todos')}
          cancelText={t('saneamiento_cancelar')}
          onConfirm={handleAprobarLote}
          onCancel={() => setShowConfirmLote(false)}
        />
      )}

      {imagenUrl && (
        <ImageModal url={imagenUrl} onClose={() => setImagenUrl(null)} />
      )}

      {audioUrl && (
        <ImageModal url={audioUrl} onClose={() => setAudioUrl(null)} isAudio />
      )}
    </section>
  )
}

function OrigenBadge({ origen }: { origen: string }) {
  if (origen === 'ocr') return <span className="saneamiento-badge saneamiento-badge-ocr">OCR</span>
  if (origen === 'recurrente') return <span className="saneamiento-badge saneamiento-badge-recurrente">{t('saneamiento_recurrente')}</span>
  if (origen === 'voz') return <span className="saneamiento-badge saneamiento-badge-voz">{t('saneamiento_voz')}</span>
  return <span className="saneamiento-badge">{origen}</span>
}
