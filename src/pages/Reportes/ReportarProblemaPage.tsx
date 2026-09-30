import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { rpc, supabase } from '@/lib/supabase'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import { t } from '@/locales/i18n'
import { APP_VERSION } from '@/config/app'
import './ReportarProblemaPage.css'

const BUCKET = 'reportes'
const MAX_MEDIA = 3
const MAX_DESC = 4000
const DESC_COUNTER_THRESHOLD = 3600
const MAX_IMAGE_WIDTH = 1080
const WEBP_QUALITY = 0.75

interface CrearReporteResult {
  ok: boolean
  reporte_id?: number
  estado?: 'nuevo'
  error_key?: string
}

type MediaStatus = 'uploading' | 'done' | 'error'

/** Owner decision: every report is either a bug or a feature suggestion. */
type ReporteTipo = 'bug' | 'sugerencia'

interface MediaItem {
  localId: string
  status: MediaStatus
  /** Storage object path, only set once the upload finished. */
  path?: string
  /** Signed URL for local preview (private bucket). */
  previewUrl?: string
  /** Local blob URL shown while the upload is still in flight. */
  localUrl?: string
}

interface SubmitPayload {
  p_titulo: string
  p_descripcion: string
  p_tipo: ReporteTipo
  p_transcripcion_audio: null
  p_tiene_audio: false
  p_media: string[]
  p_pantalla: string
  p_version_app: string
  p_plataforma: string
}

function detectPlatform(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'web'
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Downscale to max width and re-encode as WebP (falls back to JPEG when WebP is unsupported). */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const type = canvas.toDataURL('image/webp', 0.01).startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, WEBP_QUALITY))
  if (!blob) throw new Error('compression-failed')
  return blob
}

export function ReportarProblemaPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<ReporteTipo>('bug')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaLimitMsg, setMediaLimitMsg] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sentId, setSentId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Paths uploaded to storage that were never submitted: best-effort cleanup on unmount.
  const orphanPathsRef = useRef<Set<string>>(new Set())
  const submittedRef = useRef(false)
  const mediaRef = useRef<MediaItem[]>([])
  mediaRef.current = media

  // Source screen comes from the entry tap (router state); fallback to the
  // referrer route or the current pathname.
  const sourceScreen =
    (location.state as { origen?: string } | null)?.origen ??
    (typeof document !== 'undefined' && document.referrer
      ? new URL(document.referrer).pathname
      : '/')

  useEffect(() => {
    return () => {
      // Abandoned (never submitted): remove every uploaded object, silent.
      if (submittedRef.current) return
      const paths = Array.from(orphanPathsRef.current)
      if (paths.length === 0) return
      void supabase.storage.from(BUCKET).remove(paths).catch(() => {})
    }
  }, [])

  const pendingUploads = media.filter((m) => m.status === 'uploading').length
  const titleValid = titulo.trim().length >= 5
  const descValid = descripcion.trim().length >= 10 && descripcion.trim().length <= MAX_DESC
  const clientValid = titleValid && descValid
  const canSubmit = clientValid && pendingUploads === 0 && !submitting && sentId === null

  const updateMediaItem = (localId: string, patch: Partial<MediaItem>) => {
    setMedia((prev) => prev.map((m) => (m.localId === localId ? { ...m, ...patch } : m)))
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMediaLimitMsg(false)
    const slotsLeft = MAX_MEDIA - mediaRef.current.length
    if (slotsLeft <= 0) {
      setMediaLimitMsg(true)
      return
    }
    const accepted = Array.from(files).slice(0, slotsLeft)
    if (files.length > slotsLeft) setMediaLimitMsg(true)
    const authUserId = user?.id
    if (!authUserId) return

    for (const file of accepted) {
      const localId = newId()
      const localUrl = URL.createObjectURL(file)
      setMedia((prev) => [...prev, { localId, status: 'uploading', localUrl }])
      try {
        const blob = await compressImage(file)
        const path = `${authUserId}/${newId()}.webp`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: blob.type, upsert: false })
        if (error) throw error
        orphanPathsRef.current.add(path)
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
        updateMediaItem(localId, { status: 'done', path, previewUrl: signed?.signedUrl ?? undefined })
      } catch {
        updateMediaItem(localId, { status: 'error' })
        showToast(t('reporte_error_media'), 'error')
      } finally {
        // The blob URL is only needed while uploading; release it lazily.
        setTimeout(() => URL.revokeObjectURL(localUrl), 5000)
      }
    }
  }

  const removeMediaItem = async (localId: string) => {
    const item = mediaRef.current.find((m) => m.localId === localId)
    setMedia((prev) => prev.filter((m) => m.localId !== localId))
    if (item?.path) {
      orphanPathsRef.current.delete(item.path)
      try {
        await supabase.storage.from(BUCKET).remove([item.path])
      } catch {
        // Silent: storage cleanup is best effort.
      }
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const paths = mediaRef.current.filter((m) => m.status === 'done' && m.path).map((m) => m.path as string)
      const payload: SubmitPayload = {
        p_titulo: titulo.trim(),
        p_descripcion: descripcion.trim(),
        p_tipo: tipo,
        p_transcripcion_audio: null,
        p_tiene_audio: false,
        p_media: paths,
        p_pantalla: sourceScreen,
        p_version_app: APP_VERSION,
        p_plataforma: detectPlatform(),
      }
      const res = await rpc<CrearReporteResult>('fn_crear_reporte', payload as unknown as Record<string, unknown>)
      if (res?.ok && typeof res.reporte_id === 'number') {
        // The report owns the media now: stop the unmount cleanup for those paths.
        submittedRef.current = true
        for (const p of paths) orphanPathsRef.current.delete(p)
        setSentId(res.reporte_id)
        telemetry.track('reporte_enviado', {}, TELEMETRY_PRIORITY.LOW)
      } else {
        showToast(res?.error_key ? t(res.error_key) : t('reporte_error_generico'), 'error')
      }
    } catch {
      showToast(t('reporte_error_generico'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (sentId !== null) {
    return (
      <main className="page reporte-page" aria-labelledby="reporte-success-title">
        <ConfigBackButton />
        <div className="reporte-success" role="status">
          <span className="reporte-success-icon" aria-hidden="true">✅</span>
          <h1 id="reporte-success-title" className="reporte-success-title">{t('reporte_enviado_ok')}</h1>
          <p className="reporte-success-sub">{t('reporte_enviado_ok_sub', { id: sentId })}</p>
          <button type="button" className="btn btn-ghost reporte-success-back" onClick={() => navigate('/configuracion')}>
            {t('btn_back')}
          </button>
        </div>
      </main>
    )
  }

  const descTrimmed = descripcion.trim().length

  return (
    <main className="page reporte-page" aria-labelledby="reporte-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="reporte-title">{t('reportes_pagina_titulo')}</h1>
      </header>

      <section className="reporte-card">
        <div className="reporte-field">
          <span className="reporte-field-label" id="reporte-tipo-label">{t('reporte_tipo_label')}</span>
          <div className="reporte-segmented" role="group" aria-labelledby="reporte-tipo-label">
            <button
              type="button"
              className={`reporte-seg-btn ${tipo === 'bug' ? 'reporte-seg-btn--active reporte-seg-btn--bug' : ''}`}
              aria-pressed={tipo === 'bug'}
              onClick={() => setTipo('bug')}
            >
              {t('reporte_tipo_bug')}
            </button>
            <button
              type="button"
              className={`reporte-seg-btn ${tipo === 'sugerencia' ? 'reporte-seg-btn--active reporte-seg-btn--sugerencia' : ''}`}
              aria-pressed={tipo === 'sugerencia'}
              onClick={() => setTipo('sugerencia')}
            >
              {t('reporte_tipo_sugerencia')}
            </button>
          </div>
        </div>

        <div className="reporte-field">
          <label htmlFor="reporte-titulo">{t('reporte_titulo_label')}</label>
          <input
            id="reporte-titulo"
            type="text"
            maxLength={120}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={t('reporte_titulo_placeholder')}
            autoComplete="off"
          />
          {titulo.length > 0 && !titleValid && (
            <p className="reporte-field-error">{t('error_reporte_titulo')}</p>
          )}
        </div>

        <div className="reporte-field">
          <label htmlFor="reporte-descripcion">{t('reporte_descripcion_label')}</label>
          <textarea
            id="reporte-descripcion"
            rows={6}
            maxLength={MAX_DESC}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={tipo === 'sugerencia' ? t('reporte_descripcion_placeholder_sugerencia') : t('reporte_descripcion_placeholder')}
          />
          {descTrimmed > 0 && descTrimmed < 10 && (
            <p className="reporte-field-error">{t('error_reporte_descripcion')}</p>
          )}
          {descripcion.length >= DESC_COUNTER_THRESHOLD && (
            <p className="reporte-counter">{descripcion.length} / {MAX_DESC}</p>
          )}
          <p className="reporte-privacy">{t('reporte_aviso_privacidad')}</p>
        </div>

        <div className="reporte-field">
          <span className="reporte-field-label">{t('reporte_capturas_label')}</span>
          <div className="reporte-thumbs">
            {media.map((item) => (
              <div key={item.localId} className={`reporte-thumb ${item.status === 'error' ? 'reporte-thumb--error' : ''}`}>
                {item.status === 'error' ? (
                  <span className="reporte-thumb-error-icon" aria-hidden="true">⚠️</span>
                ) : (
                  <img
                    className="reporte-thumb-img"
                    src={item.previewUrl ?? item.localUrl}
                    alt={t('reporte_ver_imagen')}
                  />
                )}
                {item.status === 'uploading' && <span className="reporte-thumb-spinner" aria-hidden="true" />}
                <button
                  type="button"
                  className="reporte-thumb-remove"
                  aria-label={t('btn_delete')}
                  onClick={() => void removeMediaItem(item.localId)}
                >
                  ×
                </button>
              </div>
            ))}
            {media.length < MAX_MEDIA && (
              <button
                type="button"
                className="reporte-thumb-add"
                onClick={() => fileInputRef.current?.click()}
              >
                <span aria-hidden="true">＋</span>
                <span className="reporte-thumb-add-text">{t('reporte_capturar_mas')}</span>
              </button>
            )}
          </div>
          {mediaLimitMsg && <p className="reporte-field-error">{t('reporte_max_3_capturas')}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary reporte-submit"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting || pendingUploads > 0 ? t('reporte_enviando') : t('reporte_enviar')}
        </button>
      </section>
    </main>
  )
}

export default ReportarProblemaPage
