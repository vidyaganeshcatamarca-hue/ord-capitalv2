import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { useToast } from '@/contexts/ToastContext'
import { rpc, supabase } from '@/lib/supabase'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import { t } from '@/locales/i18n'
import './MisReportesPage.css'

const BUCKET = 'reportes'
const SIGNED_URL_TTL = 3600

type ReporteEstado = 'nuevo' | 'en_revision' | 'resuelto'

type ReporteTipo = 'bug' | 'sugerencia'

interface Reporte {
  reporte_id: number
  titulo: string
  descripcion: string | null
  estado: ReporteEstado
  tipo?: ReporteTipo
  creado_el: string
  respuesta_admin: string | null
  pantalla: string | null
  tiene_audio: boolean
  media: string[]
}

interface MisReportesResult {
  ok: boolean
  reportes?: Reporte[]
  error_key?: string
}

interface EliminarReporteResult {
  ok: boolean
  error_key?: string
}

const ESTADO_PILL_CLASS: Record<ReporteEstado, string> = {
  nuevo: 'reportes-pill reportes-pill--nuevo',
  en_revision: 'reportes-pill reportes-pill--revision',
  resuelto: 'reportes-pill reportes-pill--resuelto',
}

const ESTADO_LABEL: Record<ReporteEstado, string> = {
  nuevo: 'reporte_estado_nuevo',
  en_revision: 'reporte_estado_en_revision',
  resuelto: 'reporte_estado_resuelto',
}

const TIPO_TAG_CLASS: Record<ReporteTipo, string> = {
  bug: 'reportes-tag reportes-tag--bug',
  sugerencia: 'reportes-tag reportes-tag--sugerencia',
}

const TIPO_LABEL: Record<ReporteTipo, string> = {
  bug: 'reporte_tipo_problema_tag',
  sugerencia: 'reporte_tipo_sugerencia_tag',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

function formatFullDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function MisReportesPage() {
  const { showToast } = useToast()
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  // Signed media URLs cached per report while the card is expanded.
  const [mediaUrls, setMediaUrls] = useState<Record<number, Array<string | null>>>({})
  const [deletingReporte, setDeletingReporte] = useState<Reporte | null>(null)
  const [deleting, setDeleting] = useState(false)
  const mountedRef = useRef(true)

  const fetchReportes = useCallback(async () => {
    try {
      const res = await rpc<MisReportesResult>('fn_obtener_mis_reportes')
      if (!mountedRef.current) return
      if (res?.ok) {
        setReportes(res.reportes ?? [])
      } else {
        showToast(res?.error_key ? t(res.error_key) : t('reporte_error_generico'), 'error')
      }
    } catch {
      if (mountedRef.current) showToast(t('reporte_error_generico'), 'error')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    mountedRef.current = true
    telemetry.track('mis_reportes_open', {}, TELEMETRY_PRIORITY.LOW)
    void fetchReportes()
    return () => { mountedRef.current = false }
  }, [fetchReportes])

  const loadMediaUrls = async (reporte: Reporte) => {
    if (reporte.media.length === 0 || mediaUrls[reporte.reporte_id]) return
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(reporte.media, SIGNED_URL_TTL)
    if (!mountedRef.current || error || !data) return
    setMediaUrls((prev) => ({
      ...prev,
      [reporte.reporte_id]: data.map((item) => item.signedUrl ?? null),
    }))
  }

  const toggleExpand = (reporte: Reporte) => {
    const next = expandedId === reporte.reporte_id ? null : reporte.reporte_id
    setExpandedId(next)
    if (next !== null) void loadMediaUrls(reporte)
  }

  const handleDelete = async () => {
    if (!deletingReporte || deleting) return
    setDeleting(true)
    try {
      const res = await rpc<EliminarReporteResult>('fn_eliminar_mi_reporte', {
        p_reporte_id: deletingReporte.reporte_id,
      })
      if (!res?.ok) {
        showToast(res?.error_key ? t(res.error_key) : t('error_reporte_borrar'), 'error')
        return
      }
      // Report row is gone: best-effort removal of its media objects.
      if (deletingReporte.media.length > 0) {
        try {
          await supabase.storage.from(BUCKET).remove(deletingReporte.media)
        } catch {
          // Silent: storage cleanup is best effort.
        }
      }
      showToast(t('reporte_borrado_ok'), 'success')
      setDeletingReporte(null)
      setExpandedId(null)
      setMediaUrls((prev) => {
        const next = { ...prev }
        delete next[deletingReporte.reporte_id]
        return next
      })
      await fetchReportes()
    } catch {
      showToast(t('error_reporte_borrar'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="page reportes-page" aria-labelledby="reportes-mis-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="reportes-mis-title">{t('reportes_pagina_mis')}</h1>
      </header>

      {loading && (
        <div className="reportes-loading">
          <div className="reportes-spinner" />
        </div>
      )}

      {!loading && reportes.length === 0 && (
        <div className="reportes-empty">
          <p className="reportes-empty-title">{t('reportes_vacio')}</p>
          <p className="reportes-empty-sub">{t('reportes_vacio_sub')}</p>
        </div>
      )}

      {!loading && reportes.length > 0 && (
        <ul className="reportes-list">
          {reportes.map((reporte) => {
            const expanded = expandedId === reporte.reporte_id
            // The RPC guarantees tipo; fall back to 'bug' for defensive rendering.
            const tipo: ReporteTipo = reporte.tipo === 'sugerencia' ? 'sugerencia' : 'bug'
            return (
              <li key={reporte.reporte_id} className="reportes-card">
                <button
                  type="button"
                  className="reportes-card-header"
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(reporte)}
                >
                  <span className="reportes-card-title">{reporte.titulo}</span>
                  <span className="reportes-card-date">{formatDate(reporte.creado_el)}</span>
                  <span className={TIPO_TAG_CLASS[tipo]}>{t(TIPO_LABEL[tipo])}</span>
                  <span className={ESTADO_PILL_CLASS[reporte.estado]}>{t(ESTADO_LABEL[reporte.estado])}</span>
                </button>

                {expanded && (
                  <div className="reportes-card-body">
                    <p className="reportes-card-full-date">{formatFullDate(reporte.creado_el)}</p>
                    {reporte.descripcion && <p className="reportes-card-desc">{reporte.descripcion}</p>}
                    {reporte.pantalla && (
                      <p className="reportes-card-pantalla">{t('reporte_pantalla_label')}: {t(reporte.pantalla)}</p>
                    )}

                    {reporte.respuesta_admin && (
                      <div className="reportes-answer">
                        <span className="reportes-answer-label">{t('reporte_respuesta_admin')}</span>
                        <p className="reportes-answer-text">{reporte.respuesta_admin}</p>
                      </div>
                    )}

                    {reporte.media.length > 0 && (
                      <div className="reportes-media">
                        {(mediaUrls[reporte.reporte_id] ?? reporte.media.map(() => null)).map((url, idx) => (
                          <div key={reporte.media[idx]} className="reportes-media-thumb">
                            {url ? (
                              <img className="reportes-media-img" src={url} alt={t('reporte_ver_imagen')} loading="lazy" />
                            ) : (
                              <span className="reportes-media-placeholder" aria-hidden="true">🖼️</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="reportes-card-footer">
                      {reporte.tiene_audio && (
                        <span className="reportes-audio-icon" aria-hidden="true">🎙️</span>
                      )}
                      {reporte.estado === 'nuevo' && (
                        <button
                          type="button"
                          className="reportes-delete-btn"
                          onClick={() => setDeletingReporte(reporte)}
                        >
                          {t('reporte_eliminar')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmModal
        isOpen={deletingReporte !== null}
        title={t('reporte_eliminar')}
        message={t('reporte_confirmar_eliminar')}
        confirmText={t('btn_delete')}
        cancelText={t('btn_cancel')}
        type="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingReporte(null)}
      />
    </main>
  )
}

export default MisReportesPage
