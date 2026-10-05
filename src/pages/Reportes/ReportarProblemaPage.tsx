import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { VoiceRecorderButton } from '@/components/voice/VoiceRecorderButton'
import '@/components/voice/VoiceRecorderModal.css'
import '../Configuracion/ConfigSectionPage.css'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { rpc, supabase } from '@/lib/supabase'
import { trackPendingReporte, type ReporteOutcome } from '@/lib/reportesPending'
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
import {
  ArrowLeftRight,
  AudioLines,
  BarChart3,
  Bug,
  CreditCard,
  ChevronDown,
  Coins,
  Feather,
  HeartPulse,
  HelpCircle,
  Inbox,
  LifeBuoy,
  Mail,
  MapPin,
  Mic,
  MinusCircle,
  PieChart,
  PlusCircle,
  Receipt,
  RotateCcw,
  Settings,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Home,
  PiggyBank,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { BUG_REPORT_MAX_AUDIO_MS, AUDIO_HARD_CUT_GRACE_MS } from '@/voice/contract'
import { VoiceCountdown } from '@/components/voice/VoiceCountdown'
import { useVoiceRecorder } from '@/voice/useVoiceRecorder'
import { POLL_DELAYS_MS, POLL_INTERVAL_MAX_MS } from '@/voice/useVoicePolling'
import { APP_VERSION } from '@/config/app'
import './ReportarProblemaPage.css'

const BUCKET = 'reportes'
const MAX_MEDIA = 3

// Screen picker tree (owner-defined): a static hierarchy of app areas where
// the bug may have happened. Every node is selectable (broad pick = parent,
// specific pick = deepest node), mirroring the home-filter rubro accordion:
// row tap selects, chevron expands. Values stored = stable key codes.
interface PantallaNode {
  code: string
  iconKey: string
  children?: PantallaNode[]
}

const PANTALLA_TREE: PantallaNode[] = [
  { code: 'pantalla_inicio', iconKey: 'home' },
  { code: 'pantalla_cuentas', iconKey: 'wallet', children: [
    { code: 'pantalla_ingresos', iconKey: 'wallet', children: [
      { code: 'pantalla_billeteras', iconKey: 'wallet' },
      { code: 'pantalla_fuentes', iconKey: 'coins' },
    ] },
    { code: 'pantalla_egresos', iconKey: 'trending-down' },
  ] },
  { code: 'pantalla_tarjetas', iconKey: 'card' },
  { code: 'pantalla_carga', iconKey: 'arrow-left-right', children: [
    { code: 'pantalla_carga_egreso', iconKey: 'minus-circle' },
    { code: 'pantalla_carga_ingreso', iconKey: 'plus-circle' },
    { code: 'pantalla_carga_transferencia', iconKey: 'arrow-left-right' },
    { code: 'pantalla_carga_voz', iconKey: 'mic' },
    { code: 'pantalla_tickets', iconKey: 'receipt' },
  ] },
  { code: 'pantalla_presupuestos', iconKey: 'pie-chart', children: [
    { code: 'pantalla_presupuesto_libertad', iconKey: 'feather' },
    { code: 'pantalla_presupuesto_base_cero', iconKey: 'rotate-ccw' },
  ] },
  { code: 'pantalla_saneamiento', iconKey: 'sparkles', children: [
    { code: 'pantalla_para_aprobar', iconKey: 'inbox' },
  ] },
  { code: 'pantalla_analisis', iconKey: 'bar-chart-3', children: [
    { code: 'pantalla_salud', iconKey: 'heart-pulse' },
    { code: 'pantalla_supervivencia', iconKey: 'life-buoy' },
  ] },
  { code: 'pantalla_ahorros', iconKey: 'piggy-bank', children: [
    { code: 'pantalla_sobres', iconKey: 'mail' },
    { code: 'pantalla_inversiones', iconKey: 'trending-up' },
  ] },
  { code: 'pantalla_familia', iconKey: 'users' },
  { code: 'pantalla_ajustes', iconKey: 'settings', children: [
    { code: 'pantalla_ayuda', iconKey: 'help-circle' },
    { code: 'pantalla_reportes', iconKey: 'bug' },
  ] },
  { code: 'pantalla_otra', iconKey: 'map-pin' },
]

// Breadcrumb: ancestor codes leading to `code` (joined with " › " at render).

/* Recursive node rows, same interaction as the home-filter rubro accordion:
   the row button SELECTS (any depth), the chevron expands children. */
const PANTALLA_ICONS: Record<string, ReactNode> = {
  wallet: <Wallet size={16} />,
  'audio-lines': <AudioLines size={16} />,
  card: <CreditCard size={16} />,
  coins: <Coins size={16} />,
  home: <Home size={16} />,
  'piggy-bank': <PiggyBank size={16} />,
  'trending-down': <TrendingDown size={16} />,
  'arrow-left-right': <ArrowLeftRight size={16} />,
  'minus-circle': <MinusCircle size={16} />,
  'plus-circle': <PlusCircle size={16} />,
  mic: <Mic size={16} />,
  receipt: <Receipt size={16} />,
  'pie-chart': <PieChart size={16} />,
  feather: <Feather size={16} />,
  'rotate-ccw': <RotateCcw size={16} />,
  sparkles: <Sparkles size={16} />,
  inbox: <Inbox size={16} />,
  'bar-chart-3': <BarChart3 size={16} />,
  'heart-pulse': <HeartPulse size={16} />,
  'life-buoy': <LifeBuoy size={16} />,
  mail: <Mail size={16} />,
  'trending-up': <TrendingUp size={16} />,
  users: <Users size={16} />,
  settings: <Settings size={16} />,
  'help-circle': <HelpCircle size={16} />,
  bug: <Bug size={16} />,
  'map-pin': <MapPin size={16} />,
}

function PantallaNodeRow({ node, depth, expanded, onToggle, onSelect }: {
  node: PantallaNode
  depth: number
  expanded: Set<string>
  onToggle: (code: string) => void
  onSelect: (code: string) => void
}) {
  const isOpen = expanded.has(node.code)
  const hijos = node.children ?? []
  return (
    <>
      <div className="reporte-tree-row" style={{ paddingLeft: depth * 14 }}>
        <button
          className="reporte-tree-btn"
          onClick={() => onSelect(node.code)}
        >
          <span className="reporte-tree-icon">{PANTALLA_ICONS[node.iconKey] ?? null}</span>
          <span className="reporte-tree-name">{t(node.code)}</span>
        </button>
        {hijos.length > 0 && (
          <button
            type="button"
            className="reporte-tree-expand"
            onClick={() => onToggle(node.code)}
            aria-label={t(isOpen ? 'btn_collapse' : 'btn_expand')}
          >
            {isOpen ? '▲' : '▼'}
          </button>
        )}
      </div>
      {isOpen && hijos.map((child) => (
        <PantallaNodeRow key={child.code} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </>
  )
}

function PantallaTree({ nodes, expanded, onToggle, onSelect }: {
  nodes: PantallaNode[]
  expanded: Set<string>
  onToggle: (code: string) => void
  onSelect: (code: string) => void
}) {
  return (
    <>
      {nodes.map((node) => (
        <PantallaNodeRow key={node.code} node={node} depth={0} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </>
  )
}

function pantallaPathOf(code: string): string[] {
  const walk = (nodes: PantallaNode[], acc: string[]): string[] | null => {
    for (const n of nodes) {
      if (n.code === code) return [...acc, n.code]
      const found = n.children ? walk(n.children, [...acc, n.code]) : null
      if (found) return found
    }
    return null
  }
  return walk(PANTALLA_TREE, []) ?? [code]
}

// TEMP (E2E flag, owner 2026-10-02): dev-only source-language override for the
// whole bug-report flow (audio job `language` AND translate `language`).
// The selector renders only in dev builds (import.meta.env.DEV) so production
// builds never show or use it; remove together with this block later.
// Owner: 15s ceiling for the final RPC; past it the send keeps running and
// the app-level watcher announces the outcome from any screen.
const REPORT_SEND_TIMEOUT_MS = 15000
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
  /** Spanish translation (owner dashboard only). */
  p_descripcion: string | null
  /** The user's text in its ORIGINAL language, shown back to the reporter. */
  p_texto_original: string | null
  p_tipo: ReporteTipo
  p_transcripcion_audio: string | null
  p_tiene_audio: boolean
  p_media: string[]
  p_pantalla: string | null
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
  const recorder = useVoiceRecorder({ maxDurationMs: BUG_REPORT_MAX_AUDIO_MS - AUDIO_HARD_CUT_GRACE_MS })
  // Owner: when the mic tap starts a take, the countdown ring renders below
  // the description textarea, out of view. Scroll it to screen center so the
  // user always SEES that recording started.
  const recordingBlockRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (recorder.state === 'recording') {
      recordingBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [recorder.state])
  // Paths uploaded to storage that were never submitted: best-effort cleanup on unmount.
  const orphanPathsRef = useRef<Set<string>>(new Set())
  const submittedRef = useRef(false)
  const mediaRef = useRef<MediaItem[]>([])
  mediaRef.current = media

  // Owner decision: the affected screen/menu is USER-SELECTED (required),
  // grouped by app area; value stored = the stable key code. No auto-pick.
  const [pantallaElegida, setPantallaElegida] = useState('')
  const [showScreenPicker, setShowScreenPicker] = useState(false)
  const [expandedPantalla, setExpandedPantalla] = useState<Set<string>>(new Set())
  const [pantallaPath, setPantallaPath] = useState<string[]>([])
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
  const pantallaRequired = tipo === 'bug'
  const canSubmit = clientValid && (!pantallaRequired || pantallaElegida !== '') && pendingUploads === 0 && !submitting && !audioProcessing && sentId === null
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
      // Owner: 15s waiting ceiling. Past it the user is freed and the
      // submission outcome is announced by the app-level watcher, from any
      // screen (same pattern as the voice jobs).
      const pendingRpc: Promise<CrearReporteResult> = rpc<CrearReporteResult>(
        'fn_crear_reporte',
        payload as unknown as Record<string, unknown>
      )
      let res: CrearReporteResult | 'timeout' = 'timeout'
      try {
        res = (await Promise.race([
          pendingRpc,
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), REPORT_SEND_TIMEOUT_MS)),
        ])) as CrearReporteResult | 'timeout'
      } catch (rpcError) {
        showToast(t('reporte_error_generico'), 'error')
        return false
      }
      if (res === 'timeout') {
        trackPendingReporte(
          pendingRpc.then((r) => ({
            ok: !!r?.ok && typeof r.reporte_id === 'number',
            reporteId: r?.ok ? (r.reporte_id ?? null) : null,
          }))
        )
        showToast(t('reporte_envio_demora'))
        navigate('/configuracion')
        window.location.hash = ''
        return false
      }
      if (res?.ok && typeof res.reporte_id === 'number') {
        // The report owns the media now: stop the unmount cleanup for those paths.
        submittedRef.current = true
        for (const p of paths) orphanPathsRef.current.delete(p)
        setSentId(res.reporte_id)
        // Owner: the send mode is measured (audio | text | both | pending) to
        // learn how users report bugs for the telemetry dashboard.
        const sendMode =
          payload.p_tiene_audio && payload.p_descripcion != null && payload.p_descripcion.trim() !== ''
            ? 'both'
            : payload.p_tiene_audio
              ? 'audio'
              : 'text'
        telemetry.track('reporte_enviado', { send_mode: sendMode }, TELEMETRY_PRIORITY.LOW)
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
    // An attached take carries the report body: submit via the audio path.
    // The written note (if any) travels along as the optional description.
    if (audioReady) {
      void handleSendAudio()
      return
    }
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const paths = doneMediaPaths()
      // All-or-nothing: nothing reaches fn_crear_reporte unless the translate
      // endpoint confirmed the Spanish text. Both texts travel together: the
      // original (for the user) and the translation (for the owner dashboard).
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) {
        showToast(t('reporte_translate_error'), 'error')
        return
      }
      // The RPC carries both texts: `p_texto_original` is what the user wrote
      // (shown back to them) and `p_descripcion` is the Spanish translation
      // (owner dashboard only).
      const textoOriginal = descripcion.trim()
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
        p_texto_original: textoOriginal !== '' ? textoOriginal : null,
        p_tipo: tipo,
        p_transcripcion_audio: null,
        p_tiene_audio: false,
        p_media: paths,
        p_pantalla: pantallaRequired ? pantallaElegida : null,
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

  // Owner round-2: TAP toggle, no hold. First tap starts recording and the
  // visible ring counts 60->0; a second tap stops the take - and stopping
  // sends (voz recorder closure: take ends => transcript flows).
  const handleMicTap = () => {
    // Owner bug-1: tapping the mic while the note textarea is focused must not
    // leave the soft keyboard up - close it explicitly on every mic tap.
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) active.blur()
    if (recorder.state === 'recording') {
      // Second tap: stop the take. A confirm block then asks to send the
      // FULL report: Enviar submits title+type+screen+captures+transcript
      // (owner: "enviar" is not the note, it is the whole issue).
      recorder.stop()
      return
    }
    if (recorder.state === 'requesting_permission' || audioProcessing || submitting || !!sentId) return
    audioKeyRef.current = newId()
    void recorder.start()
  }


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
      const paths = doneMediaPaths()
      // Written note routing (owner): whatever the user TYPED travels through
      // the translate endpoint to become final Spanish; the AUDIO went to the
      // transcription above. Both may co-exist in one report.
      let descExtra: string | null = null
      const note = descripcion.trim()
      if (note.length > 0) {
        const extra = await translateBugReportText({
          text: note,
          language: sourceLanguage,
          accessToken,
        })
        if (extra.errorCode) {
          // Keep the take pending so Enviar retries the whole flow with the
          // same idempotency key (no report was created).
          setAudioProcessing(false)
          showToast(t('reporte_translate_error'), 'error')
          return
        }
        descExtra = extra.text
      }
      // The backend owns the audio now: drop the in-memory take before the RPC.
      discardAudio()
      const payload: SubmitPayload = {
        p_titulo: titulo.trim(),
        p_descripcion: descExtra,
        p_texto_original: note !== '' ? note : null,
        p_tipo: tipo,
        p_transcripcion_audio: transcript,
        p_tiene_audio: true,
        p_media: paths,
        p_pantalla: pantallaRequired ? pantallaElegida : null,
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
          <label htmlFor="reporte-titulo">{tipo === 'sugerencia' ? t('reporte_titulo_sugerencia') : t('reporte_titulo_label')}</label>
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

        {pantallaRequired && (
        <div className="reporte-field">
          <span className="reporte-field-label">{t('pantalla_label')}</span>
          <button
            type="button"
            className="reporte-picker-trigger"
            onClick={() => setShowScreenPicker(true)}
            aria-haspopup="dialog"
          >
            <span className={pantallaElegida ? '' : 'reporte-picker-placeholder'}>
              {pantallaElegida
                ? pantallaPath.map((c) => t(c)).join(' › ')
                : t('pantalla_placeholder')}
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          {/* Owner: the inline red hint was redundant with the select's own
              placeholder and squeezed the layout; remove it and keep the gap. */}
        </div>
        )}


        <div className="reporte-field">
          <div className="reporte-desc-top">
            <label htmlFor="reporte-descripcion">{tipo === 'sugerencia' ? t('reporte_descripcion_label_sugerencia') : t('reporte_descripcion_label')}</label>
            <div className="reporte-mic-wrap">
              <p className="reporte-audio-hint">{t('reporte_audio_hint_titulo')}</p>
              <VoiceRecorderButton
                label={t('reporte_audio_hint_titulo')}
                onPressStart={handleMicTap}
                onPressEnd={() => {}}
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

        {(
          recorder.state === 'recording'
          || recorder.state === 'requesting_permission'
          || recorder.state === 'recorded' && recorder.autoStopped
          || audioReady
          || audioProcessing
        ) && (
          <div className="reporte-field reporte-audio" ref={recordingBlockRef}>
            {audioProcessing ? (
              <div className="reporte-audio-block" role="status">
                <span className="reporte-audio-spinner" aria-hidden="true" />
                <p className="reporte-audio-status">{t('reporte_audio_procesando')}</p>
                <button type="button" className="btn btn-ghost" onClick={handleCancelAudioSend}>
                  {t('reporte_audio_cancelar')}
                </button>
              </div>
            ) : audioReady ? (
              <div className="reporte-audio-block reporte-audio-confirm">
                <span className="reporte-audio-badge" aria-hidden="true"><AudioLines size={24} /></span>
                <p className="reporte-audio-status">{t('reporte_audio_grabada')}</p>
                <button type="button" className="btn btn-outline" onClick={discardAudio}>
                  {t('reporte_eliminar_audio')}
                </button>
              </div>
            ) : recorder.state === 'recorded' && recorder.autoStopped ? (
              <div className="reporte-audio-block">
                {/* The 60s hard cut is never sent: only a fresh recording helps. */}
                <p className="reporte-audio-alert">{t('reporte_audio_max')}</p>
                <button type="button" className="btn btn-outline" onClick={discardAudio}>
                  {t('reporte_descartar_audio')}
                </button>
              </div>
            ) : (
              <div className="reporte-audio-block reporte-audio-ringblock">
                <VoiceCountdown secondsRemaining={recorder.remainingSeconds} total={Math.round((BUG_REPORT_MAX_AUDIO_MS - AUDIO_HARD_CUT_GRACE_MS) / 1000)} />
                <p className="reporte-audio-status">{t('voice.recording')}</p>
                <button type="button" className="btn btn-outline" onClick={() => recorder.stop()}>
                  {t('reporte_audio_finalizar')}
                </button>
              </div>
            )}
          </div>
        )}

        {tipo === 'bug' && (
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
        )}

        <div className="reporte-actions">
          <button
            type="button"
            className="btn btn-primary reporte-submit"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting || pendingUploads > 0 ? t('reporte_enviando') : t('reporte_enviar')}
          </button>
          <button
            type="button"
            className="btn btn-ghost reporte-cancel"
            disabled={submitting}
            onClick={() => navigate('/configuracion')}
          >
            {t('btn_cancel')}
          </button>
        </div>
    </section>

      {showScreenPicker && (
        <div className="reporte-modal-overlay" role="dialog" aria-modal="true" aria-label={t('pantalla_picker_titulo')} onClick={() => setShowScreenPicker(false)}>
          <div className="reporte-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="reporte-modal-head">
              <span className="reporte-modal-title">{t('pantalla_picker_titulo')}</span>
              <button type="button" className="modal-close" aria-label={t('btn_close')} onClick={() => setShowScreenPicker(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="reporte-tree-list">
              <PantallaTree
                nodes={PANTALLA_TREE}
                expanded={expandedPantalla}
                onToggle={(code) => setExpandedPantalla((prev) => {
                  const next = new Set(prev)
                  if (next.has(code)) next.delete(code); else next.add(code)
                  return next
                })}
                onSelect={(code) => {
                  const path = pantallaPathOf(code)
                  setPantallaElegida(code)
                  setPantallaPath(path)
                  setShowScreenPicker(false)
                  telemetry.track('home_interaction', { interaction_type: 'report_screen_pick' }, TELEMETRY_PRIORITY.LOW)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default ReportarProblemaPage
