/**
 * TelemetryService — central telemetry layer for ORD Capital Personal.
 *
 * Design contract (telemetria/PLAN_Telemetria_BASIC_v1.md §2.3):
 * - track() is synchronous and lightweight: it only pushes to an in-memory
 *   queue, mirrored to localStorage with a throttled writer. It must NEVER
 *   be awaited in a functional code path.
 * - Events are sent in batches to a single endpoint (fn_telemetry_ingest).
 * - Flush triggers: app goes to background (primary), queue threshold,
 *   safety timer, session end, connectivity restored.
 * - Failed flushes back off (60s) instead of retrying in a tight loop.
 * - Queue is bounded and namespaced per user; on pressure, low-priority
 *   events are dropped first. localStorage backup survives until the
 *   batch is confirmed, so a crash never loses recovered events.
 * - Once-per-session events are deduplicated in memory and reset on
 *   session change (logout/login).
 * - No financial amounts, no user free text — enums/flags/ids only.
 */

import { APP_VERSION } from '@/config/app'
import { rpc } from '@/lib/supabase'

// ─── Configuration ────────────────────────────────────────────────────────────

const FLUSH_THRESHOLD = 20          // events queued → flush
const FLUSH_INTERVAL_MS = 180_000   // safety-net timer (3 min)
const FLUSH_BACKOFF_MS = 60_000     // backoff after a failed flush
const MAX_QUEUE = 500               // hard queue cap
const MAX_BATCH = 50                // server-side cap per ingest call
const PERSIST_THROTTLE_MS = 1_000   // localStorage write throttle
const STORAGE_PREFIX = 'telemetry_queue_v1'

const SCHEMA_VERSION = 'basic_v1'

export const TELEMETRY_PRIORITY = {
  HIGH: 1,      // legal consent, onboarding, first movement, errors
  MEDIUM: 2,    // movements, budget, cards, reconciliation
  LOW: 3        // navigation, filters
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelemetryEvent {
  event_id: string
  event_name: string
  event_timestamp: string
  session_id: string | null
  app_version: string
  platform: string
  schema_version: string
  priority: number
  properties: Record<string, unknown>
}

// ─── Platform detection (window.Capacitor pattern, ESM-safe) ──────────────────

function getPlatform(): string {
  try {
    const nativePlatform = (window as any).Capacitor?.getPlatform?.()
    if (typeof nativePlatform === 'string' && nativePlatform) return nativePlatform
  } catch {
    // Not a Capacitor environment → web
  }
  return 'web'
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for older webviews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

class TelemetryService {
  private queue: TelemetryEvent[] = []
  private userId: string | null = null
  private sessionId: string | null = null
  private currentModule: string | null = null
  private sessionOnce = new Set<string>()
  private flushing = false
  private nextFlushAt = 0
  private timerId: number | null = null
  private persistTimerId: number | null = null
  private enabled = false
  private initialized = false

  init(): void {
    if (this.initialized) return
    this.initialized = true

    // Primary flush trigger: app goes to background
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush()
    })

    // Connectivity restored → flush pending queue
    window.addEventListener('online', () => this.flush())

    // Capacitor native lifecycle (native background). Dynamic import keeps
    // the bundler happy in ESM and never throws on web.
    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        await App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (!state.isActive) this.flush()
        })
      } catch {
        // Web/PWA: visibilitychange covers it
      }
    })()

    // Safety-net timer for quiet foreground sessions
    this.timerId = window.setInterval(() => {
      if (this.queue.length > 0) this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  /** Telemetry only runs for authenticated users (PRD: attributed behavior only). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.sessionOnce.clear()
      this.currentModule = null
    }
  }

  /** Bind events to the current user + app session. Swaps the queue namespace. */
  setIdentity(userId: string | number | null, sessionId: string | null): void {
    const normalizedId = userId === null ? null : String(userId)
    if (normalizedId !== this.userId) {
      // Persist whatever is pending to the OLD namespace before switching
      if (this.userId !== null && this.queue.length > 0) this.persistQueue()
      this.queue = []
      this.sessionOnce.clear()
      this.currentModule = null
      this.userId = normalizedId
      this.restoreQueue()
    }
    this.sessionId = sessionId
  }

  /** End the current user session (logout): persist to the user's namespace. */
  endSession(): void {
    if (this.userId !== null && this.queue.length > 0) this.persistQueue()
    this.sessionId = null
    this.sessionOnce.clear()
    this.currentModule = null
  }

  /**
   * Track a main module opening (router-level).
   * Emits main_module_opened with the module visited right before this one,
   * then updates the module chain.
   */
  trackModule(module: string): void {
    if (!this.enabled) return
    if (this.currentModule !== module) {
      this.track('main_module_opened', {
        module,
        previous_module: this.currentModule
      }, TELEMETRY_PRIORITY.LOW)
      this.currentModule = module
    }
  }

  /** Current module (used as screen_name by error telemetry). */
  getModule(): string | null {
    return this.currentModule
  }

  /**
   * Emit an event at most once per app session (e.g. home_session_viewed).
   * Discards silently in memory — not even enqueued.
   */
  trackOncePerSession(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.enabled) return
    if (this.sessionOnce.has(eventName)) return
    this.sessionOnce.add(eventName)
    this.track(eventName, properties, TELEMETRY_PRIORITY.LOW)
  }

  /**
   * Enqueue an event. Synchronous, never throws, never blocks.
   */
  track(eventName: string, properties: Record<string, unknown> = {}, priority: number = TELEMETRY_PRIORITY.MEDIUM): void {
    try {
      if (!this.enabled) return
      this.enforceQueueCap()
      this.queue.push({
        event_id: uuid(),
        event_name: eventName,
        event_timestamp: new Date().toISOString(),
        session_id: this.sessionId,
        app_version: APP_VERSION,
        platform: getPlatform(),
        schema_version: SCHEMA_VERSION,
        priority,
        properties
      })
      this.schedulePersist()
      if (this.queue.length >= FLUSH_THRESHOLD) this.flush()
    } catch {
      // Telemetry must never break the app (PRD §4.1)
    }
  }

  /** Force-send the current queue. Fire-and-forget, safe to call anywhere. */
  flush(): void {
    if (this.flushing || this.queue.length === 0) return
    // Backoff after a failed flush: skip automatic retries inside the window
    if (Date.now() < this.nextFlushAt) return
    this.flushing = true
    const batch = this.queue.slice(0, MAX_BATCH)
    const batchIds = new Set(batch.map(e => e.event_id))

    void rpc<{ accepted: number; duplicates: number; invalid: number }>('fn_telemetry_ingest', { p_events: batch })
      .then((result) => {
        // Observability of the telemetry itself (PRD §23): server-side rejections
        // (oversized properties) are visible in the console during development.
        if (result && (result.invalid > 0 || result.duplicates > 0)) {
          console.warn('[telemetry] ingest rejected', result)
        }
        // Remove only the events actually sent (new ones may have arrived meanwhile)
        this.queue = this.queue.filter(e => !batchIds.has(e.event_id))
        this.persistQueue()
      })
      .catch(() => {
        // Keep queue; next flush attempt after the backoff window (PRD §21.4)
        this.nextFlushAt = Date.now() + FLUSH_BACKOFF_MS
      })
      .finally(() => {
        this.flushing = false
      })
  }

  // ─── Queue persistence ─────────────────────────────────────────────────────

  private enforceQueueCap(): void {
    while (this.queue.length >= MAX_QUEUE) {
      // Drop lowest-priority oldest event first (PRD §21.5)
      let dropIdx = this.queue.findIndex(e => e.priority === TELEMETRY_PRIORITY.LOW)
      if (dropIdx === -1) dropIdx = this.queue.findIndex(e => e.priority === TELEMETRY_PRIORITY.MEDIUM)
      if (dropIdx === -1) dropIdx = 0
      this.queue.splice(dropIdx, 1)
    }
  }

  /** Throttled localStorage write: O(1) per track, batched over time. */
  private schedulePersist(): void {
    if (this.persistTimerId !== null) return
    this.persistTimerId = window.setTimeout(() => {
      this.persistTimerId = null
      this.persistQueue()
    }, PERSIST_THROTTLE_MS)
  }

  private storageKey(): string {
    return this.userId === null ? `${STORAGE_PREFIX}:anon` : `${STORAGE_PREFIX}:${this.userId}`
  }

  private persistQueue(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.queue))
    } catch {
      // localStorage full/unavailable → memory queue still works
    }
  }

  private restoreQueue(): void {
    try {
      const raw = localStorage.getItem(this.storageKey())
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.queue = parsed.filter((e: TelemetryEvent) =>
          e && typeof e.event_id === 'string' && typeof e.event_name === 'string'
        )
        // Keep the backup on disk until the flush confirms: if the app is
        // killed mid-flush, recovery is not lost.
        this.persistQueue()
      }
      // Pending events from a dead session: send immediately
      if (this.queue.length > 0) this.flush()
    } catch {
      // Corrupted backup → discard, telemetry must never harm the app
      try { localStorage.removeItem(this.storageKey()) } catch { /* noop */ }
    }
  }
}

export const telemetry = new TelemetryService()
telemetry.init()