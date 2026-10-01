import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { VoiceRecorderButton } from '@/components/voice/VoiceRecorderButton'
import '@/components/voice/VoiceRecorderModal.css'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { rpc, supabase } from '@/lib/supabase'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import { t } from '@/locales/i18n'
import {
  VoiceApiError,
  createBugReportJob,
  getBugReportTranscript,
  getVoiceJob,
  isAbortError,
  translateBugReportText,
} from '@/voice/apiClient'
import { BUG_REPORT_MAX_AUDIO_MS } from '@/voice/contract'
import { VoiceCountdown } from '@/components/voice/VoiceCountdown'
import { useVoiceRecorder } from '@/voice/useVoiceRecorder'
import { POLL_DELAYS_MS, POLL_INTERVAL_MAX_MS } from '@/voice/useVoicePolling'
import { APP_VERSION } from '@/config/app'
import './ReportarProblemaPage.css'

const BUCKET = 'reportes'
const MAX_MEDIA = 3
// TEMP (E2E flag, owner 2026-10-02): dev-only source-language override for the
// whole bug-report flow (audio job `language` AND translate `language`).
// The selector renders only in dev builds (import.meta.env.DEV) so production
// builds never show or use it; remove together with this block later.
const DEV_LANG_OPTIONS: string[] = ['es-AR', 'en-US', 'pt-BR', 'fr-FR', 'it-IT', 'de-DE']
const MAX_DESC = 4000
const DESC_COUNTER_THRESHOLD = 3600
const MAX_IMAGE_WIDTH = 1080
const WEBP_QUALITY = 0.75

// Backend backoff while a job sits in retry_wait reaches 600s: the total wait
// stays generous instead of reusing the 180s movement deadline.
const BUG_AUDIO_POLL_MAX_MS = 900_000

/** Backend codes meaning the recording itself was rejected. */
const AUDIO_INVALID_CODES: readonly string[] = [
  'EMPTY_AUDIO',
  'UNSUPPORTED_AUDIO',
  'INVALID_AUDIO',
  'AUDIO_TOO_LARGE',
  'AUDIO_TOO_LONG',
  'AUDIO_CODEC_MISMATCH',
]

/** Maps a voice-backend error code to the report-specific i18n key. */
function audioErrorI18nKey(code: string): string {
  if (
    (code.startsWith('BUG_REPORT_') && code.endsWith('_LIMIT')) ||
    code === 'TOO_MANY_ACTIVE_JOBS'
  ) {
    return 'reporte_audio_limite'
  }
  if (AUDIO_INVALID_CODES.includes(code)) return 'reporte_audio_invalido'
  // WHISPER_* / TRANSLATION_*, UNKNOWN, NETWORK, TIMEOUT: generic retry hint.
  return 'reporte_audio_error_generico'
}

function newAbortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

/** Abortable sleep so a user cancel breaks the polling loop instantly. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(newAbortError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(newAbortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Same backoff the movement polling flow uses. */
function delayForBugAudioPoll(attempt: number): number {
  return POLL_DELAYS_MS[attempt] ?? POLL_INTERVAL_MAX_MS
}

/**
 * Polls a bug-report job until it completes. `retry_wait` is not an error:
 * the backend is retrying, so the loop keeps waiting and never creates a
 * second job. Resolves on `completed`; throws `VoiceApiError` otherwise.
 */
async function pollBugReportJob(
  jobId: string,
  accessToken: string,
  signal: AbortSignal
): Promise<void> {
  const deadlineAt = Date.now() + BUG_AUDIO_POLL_MAX_MS
  let attempt = 0
  for (;;) {
    if (signal.aborted) throw newAbortError()
    if (Date.now() > deadlineAt) {
      throw new VoiceApiError(
        'TIMEOUT',
        'reporte_audio_error_generico',
        null,
        'Bug report voice job timed out'
      )
    }
    await sleep(delayForBugAudioPoll(attempt), signal)
    attempt += 1
    const job = await getVoiceJob({ jobId, accessToken, signal })
    if (job.status === 'completed') return
    if (job.status === 'terminal_failed') {
      const code = job.error_code ?? 'UNKNOWN'
      throw new VoiceApiError(code, audioErrorI18nKey(code), null, code)
    }
    // queued / processing / retry_wait: the backend still owns the job.
  }
}

interface CrearReporteResult {
  ok: boolean
  reporte_id?: number
  estado?: 'nuevo'
  error_key?: string
}

type MediaStatus = 'uploading' | 'done' | 'error'

/** Owner decision: every report is either a bug or a feature suggestion. */
type ReporteTipo = 'bug' | 'sugerencia'

/** Body mode: typed description or a voice note the backend transcribes. */
type ReporteModo = 'texto' | 'audio'

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
  p_descripcion: string | null
  p_tipo: ReporteTipo
  p_transcripcion_audio: string | null
  p_tiene_audio: boolean
  p_media: string[]
  p_pantalla: string
  p_version_app: string
  p_plataforma: string
  p_idioma_origen: string
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
  // TEMP (E2E flag): '' = auto (device locale); one of DEV_LANG_OPTIONS overrides.
  const [devLang, setDevLang] = useState('')
  const sourceLanguage = devLang || navigator.language || 'es-AR'
  const [audioProcessing, setAudioProcessing] = useState(false)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaLimitMsg, setMediaLimitMsg] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sentId, setSentId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Aborts the create/poll fetch chain when the user cancels or leaves.
  const audioAbortRef = useRef<AbortController | null>(null)
  // Idempotency key of the current take: one crypto UUID per new recording.
  const audioKeyRef = useRef<string | null>(null)
  const recorder = useVoiceRecorder({ maxDurationMs: BUG_REPORT_MAX_AUDIO_MS })
  // Paths uploaded to storage that were never submitted: best-effort cleanup on unmount.
  const orphanPathsRef = useRef<Set<string>>(new Set())
  const submittedRef = useRef(false)
  const mediaRef = useRef<MediaItem[]>([])
  mediaRef.current = media

  // Owner decision: the affected screen/menu is USER-SELECTED (required),
  // grouped by app area; value stored = the stable key code. No auto-pick.
  const [pantallaElegida, setPantallaElegida] = useState('')
  useEffect(() => {
    return () => {
      // An audio send still in flight dies with the page: abort fetch + polling.
      audioAbortRef.current?.abort()
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
  // A recorded take the backend has not accepted yet (the 60s hard cut is
  // never sent). An active take already covers the report body: a short
  // description then must NOT block the submit nor nag (owner).
  const audioReady = recorder.state === 'recorded' && recorder.blob !== null && !recorder.autoStopped
  const audioTaken = audioReady || audioProcessing
  const clientValid = titleValid && (audioTaken || descValid)
  const canSubmit = clientValid && pantallaElegida !== '' && pendingUploads === 0 && !submitting && !audioProcessing && sentId === null
  const canSendAudio =
    titleValid && audioReady && pendingUploads === 0 && !audioProcessing && sentId === null

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

  /** Sends fn_crear_reporte; owns the success bookkeeping and the error toast. */
  const finishReporte = async (payload: SubmitPayload, paths: string[]): Promise<boolean> => {
    try {
      const res = await rpc<CrearReporteResult>(
        'fn_crear_reporte',
        payload as unknown as Record<string, unknown>
      )
      if (res?.ok && typeof res.reporte_id === 'number') {
        // The report owns the media now: stop the unmount cleanup for those paths.
        submittedRef.current = true
        for (const p of paths) orphanPathsRef.current.delete(p)
        setSentId(res.reporte_id)
        telemetry.track('reporte_enviado', {}, TELEMETRY_PRIORITY.LOW)
        return true
      }
      showToast(res?.error_key ? t(res.error_key) : t('reporte_error_generico'), 'error')
      return false
    } catch {
      showToast(t('reporte_error_generico'), 'error')
      return false
    }
  }

  const doneMediaPaths = (): string[] =>
    mediaRef.current.filter((m) => m.status === 'done' && m.path).map((m) => m.path as string)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const paths = doneMediaPaths()
      // All-or-nothing: fn_crear_reporte only receives the final Spanish text
      // confirmed by the translate endpoint; without it nothing is sent.
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) {
        showToast(t('reporte_translate_error'), 'error')
        return
      }
      const translation = await translateBugReportText({
        text: descripcion.trim(),
        language: sourceLanguage,
        accessToken,
      })
      if (translation.errorCode) {
        showToast(
          t(
            translation.errorCode === 'RATE_LIMITED'
              ? 'reporte_translate_limite'
              : 'reporte_translate_error'
          ),
          'error'
        )
        return
      }
      const payload: SubmitPayload = {
        p_titulo: titulo.trim(),
        p_descripcion: translation.text,
        p_tipo: tipo,
        p_transcripcion_audio: null,
        p_tiene_audio: false,
        p_media: paths,
        p_pantalla: pantallaElegida,
        p_version_app: APP_VERSION,
        p_plataforma: detectPlatform(),
        p_idioma_origen: sourceLanguage,
      }
      await finishReporte(payload, paths)
    } catch (error) {
      // Transport failure reaching the translate step: the form stays filled
      // and no report is created, so a plain retry is always safe.
      if (isAbortError(error)) return
      showToast(t('reporte_translate_error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Audio body mode ──────────────────────────────────────────────────
  const discardAudio = () => {
    // Owner decision: the take is all-or-nothing; discarding frees the mic.
    recorder.cancel()
    audioKeyRef.current = null
  }

  const handleAudioPressStart = () => {
    // Press-and-hold, same interaction as the voice feature recorder. One idempotency
    // key per take: a fresh recording always carries a fresh key (contract).
    if (recorder.state === 'recording' || recorder.state === 'requesting_permission') return
    audioKeyRef.current = newId()
    void recorder.start()
  }

  const handleAudioPressEnd = () => {
    if (recorder.state !== 'recording') return
    // Release-to-send (same flow as the voz data capture): a short title
    // cannot carry the take, so the recording is discarded cleanly.
    if (!titleValid) {
      recorder.cancel()
      audioKeyRef.current = null
      showToast(t('error_reporte_titulo'), 'error')
      return
    }
    recorder.stop()
  }

  // Once a valid take exists, the audio path fires exactly once — the
  // "Enviar nota de voz" intermediate buttons are gone (owner decision).
  const autoSendRef = useRef(false)
  useEffect(() => {
    if (!audioReady || autoSendRef.current || !canSendAudio) return
    autoSendRef.current = true
    void handleSendAudio().finally(() => { autoSendRef.current = false })
  })

  const handleCancelAudioSend = () => {
    // The backend offers no job cancel: stopping the polling and the fetch
    // discards everything. No report was created and none will be.
    audioAbortRef.current?.abort()
    audioAbortRef.current = null
    setAudioProcessing(false)
    discardAudio()
  }

  const handleSendAudio = async () => {
    if (!canSendAudio) return
    const blob = recorder.blob
    if (!blob) return
    const controller = new AbortController()
    audioAbortRef.current = controller
    setAudioProcessing(true)
    try {
      if (!audioKeyRef.current) audioKeyRef.current = newId()
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) {
        throw new VoiceApiError('UNAUTHORIZED', audioErrorI18nKey('UNAUTHORIZED'), null, 'No session')
      }
      const created = await createBugReportJob({
        audioBlob: blob,
        idempotencyKey: audioKeyRef.current,
        language: sourceLanguage,
        accessToken,
        signal: controller.signal,
      })
      await pollBugReportJob(created.job_id, accessToken, controller.signal)
      // All-or-nothing: if the transcript cannot be read, nothing reaches
      // fn_crear_reporte and the user records again or switches to text.
      const transcript = await getBugReportTranscript({
        jobId: created.job_id,
        accessToken,
        signal: controller.signal,
      })
      // The backend owns the audio now: drop the in-memory take before the RPC.
      discardAudio()
      const paths = doneMediaPaths()
      const payload: SubmitPayload = {
        p_titulo: titulo.trim(),
        p_descripcion: descripcion.trim() || null,
        p_tipo: tipo,
        p_transcripcion_audio: transcript,
        p_tiene_audio: true,
        p_media: paths,
        p_pantalla: pantallaElegida,
        p_version_app: APP_VERSION,
        p_plataforma: detectPlatform(),
        p_idioma_origen: sourceLanguage,
      }
      await finishReporte(payload, paths)
    } catch (error) {
      // An abort means the user cancelled: the cancel handler already discarded.
      if (isAbortError(error)) return
      const code = error instanceof VoiceApiError ? error.code : 'UNKNOWN'
      showToast(t(audioErrorI18nKey(code)), 'error')
      discardAudio()
    } finally {
      if (audioAbortRef.current === controller) audioAbortRef.current = null
      setAudioProcessing(false)
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
          <span className="reporte-field-label">{t('pantalla_label')}</span>
          <select
            value={pantallaElegida}
            onChange={(e) => setPantallaElegida(e.target.value)}
          >
            <option value="">{t('pantalla_placeholder')}</option>
            <optgroup label={t('pantalla_grupo_nucleo')}>
              <option value="pantalla_inicio">{t('pantalla_inicio')}</option>
              <option value="pantalla_cuentas_ingresos">{t('pantalla_cuentas_ingresos')}</option>
              <option value="pantalla_cuentas_egresos">{t('pantalla_cuentas_egresos')}</option>
              <option value="pantalla_tarjetas">{t('pantalla_tarjetas')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_carga')}>
              <option value="pantalla_carga_egreso">{t('pantalla_carga_egreso')}</option>
              <option value="pantalla_carga_ingreso">{t('pantalla_carga_ingreso')}</option>
              <option value="pantalla_carga_transferencia">{t('pantalla_carga_transferencia')}</option>
              <option value="pantalla_tickets">{t('pantalla_tickets')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_presupuesto')}>
              <option value="pantalla_presupuesto_libertad">{t('pantalla_presupuesto_libertad')}</option>
              <option value="pantalla_presupuesto_base_cero">{t('pantalla_presupuesto_base_cero')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_aprobar')}>
              <option value="pantalla_para_aprobar">{t('pantalla_para_aprobar')}</option>
              <option value="pantalla_saneamiento">{t('pantalla_saneamiento')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_analisis')}>
              <option value="pantalla_analisis">{t('pantalla_analisis')}</option>
              <option value="pantalla_salud">{t('pantalla_salud')}</option>
              <option value="pantalla_supervivencia">{t('pantalla_supervivencia')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_ahorro')}>
              <option value="pantalla_sobres">{t('pantalla_sobres')}</option>
              <option value="pantalla_inversiones">{t('pantalla_inversiones')}</option>
              <option value="pantalla_familia">{t('pantalla_familia')}</option>
            </optgroup>
            <optgroup label={t('pantalla_grupo_sistema')}>
              <option value="pantalla_ajustes">{t('pantalla_ajustes')}</option>
              <option value="pantalla_ayuda">{t('pantalla_ayuda')}</option>
              <option value="pantalla_carga_voz">{t('pantalla_carga_voz')}</option>
              <option value="pantalla_reportes">{t('pantalla_reportes')}</option>
              <option value="pantalla_otra">{t('pantalla_otra')}</option>
            </optgroup>
          </select>
        </div>

        {import.meta.env.DEV && (
          <div className="reporte-field">
            <span className="reporte-field-label">{t('reportes_dev_idioma_origen')}</span>
            <select
              value={devLang}
              onChange={(e) => setDevLang(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            >
              <option value="">{navigator.language || 'es-AR'} — {t('reportes_dev_auto')}</option>
              {DEV_LANG_OPTIONS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

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
          <div className="reporte-desc-top">
            <label htmlFor="reporte-descripcion">{t('reporte_descripcion_label')}</label>
            <div className="reporte-mic-wrap">
              <p className="reporte-audio-hint">{t('reporte_audio_hint_titulo')}</p>
              <VoiceRecorderButton
                label={t('reporte_audio_hint_titulo')}
                onPressStart={handleAudioPressStart}
                onPressEnd={handleAudioPressEnd}
                disabled={audioProcessing || submitting || !!sentId}
              />
            </div>
          </div>
          <textarea
            id="reporte-descripcion"
            rows={6}
            maxLength={MAX_DESC}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={tipo === 'sugerencia' ? t('reporte_descripcion_placeholder_sugerencia') : t('reporte_descripcion_placeholder')}
          />
          {!audioTaken && descTrimmed > 0 && descTrimmed < 10 && (
            <p className="reporte-field-error">{t('error_reporte_descripcion')}</p>
          )}
          {descripcion.length >= DESC_COUNTER_THRESHOLD && (
            <p className="reporte-counter">{descripcion.length} / {MAX_DESC}</p>
          )}
          <p className="reporte-privacy">{t('reporte_aviso_privacidad')}</p>
        </div>

        {(recorder.state === 'recording' || recorder.state === 'requesting_permission' || recorder.state === 'recorded' && recorder.autoStopped || audioProcessing) && (
          <div className="reporte-field reporte-audio">
            {audioProcessing ? (
              <div className="reporte-audio-block" role="status">
                <span className="reporte-audio-spinner" aria-hidden="true" />
                <p className="reporte-audio-status">{t('reporte_audio_procesando')}</p>
                <button type="button" className="btn btn-ghost" onClick={handleCancelAudioSend}>
                  {t('reporte_audio_cancelar')}
                </button>
              </div>
            ) : recorder.state === 'recorded' && recorder.autoStopped ? (
              <div className="reporte-audio-block">
                {/* The 60s hard cut is never sent: only a fresh recording helps. */}
                <p className="reporte-audio-alert">{t('reporte_audio_max')}</p>
                <button type="button" className="btn btn-ghost" onClick={discardAudio}>
                  {t('reporte_descartar_audio')}
                </button>
              </div>
            ) : (
              <div className="reporte-audio-block reporte-audio-ringblock">
                <VoiceCountdown secondsRemaining={recorder.remainingSeconds} total={Math.round(BUG_REPORT_MAX_AUDIO_MS / 1000)} />
                <p className="reporte-audio-status">{t('voice.record_hint')}</p>
              </div>
            )}
          </div>
        )}

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

        {
          <button
            type="button"
            className="btn btn-primary reporte-submit"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting || pendingUploads > 0 ? t('reporte_enviando') : t('reporte_enviar')}
          </button>
        }
    </section>
    </main>
  )
}

export default ReportarProblemaPage
