/**
 * TelemetryService — central telemetry layer for ORD Capital Personal.
 *
 * Design contract (telemetria/PLAN_Telemetria_BASIC_v1.md §2.3):
 * - track() is synchronous and lightweight: it only pushes to an in-memory
 *   queue mirrored to localStorage. It must NEVER be awaited in a functional
 *   code path.
 * - Events are sent in batches to a single endpoint (fn_telemetry_ingest).
 * - Flush triggers: app goes to background (primary), queue threshold,
 *   safety timer, session end, connectivity restored.
 * - Queue is bounded; on pressure, low-priority events are dropped first.
 * - Once-per-session events are deduplicated in memory.
 * - No financial amounts, no user free text — enums/flags/ids only.
 */

import { APP_VERSION } from '@/config/app'
import { rpc } from '@/lib/supabase'

// ─── Configuration ────────────────────────────────────────────────────────────

const FLUSH_THRESHOLD = 20          // events queued → flush
const FLUSH_INTERVAL_MS = 180_000   // safety-net timer (3 min)
const MAX_QUEUE = 500               // hard queue cap
const MAX_BATCH = 50                // server-side cap per ingest call
const STORAGE_KEY = 'telemetry_queue_v1'

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

// ─── Platform detection (same source of truth as useSessionTracker) ──────────

let cachedPlatform: string | null = null

function getPlatform(): string {
  if (cachedPlatform !== null) return cachedPlatform
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Capacitor } = require('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const nativePlatform = Capacitor.getPlatform()
      cachedPlatform = nativePlatform
      return nativePlatform
    }
  } catch {
    // Not a Capacitor environment → web
  }
  cachedPlatform = 'web'
  return cachedPlatform
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
  private sessionId: string | null = null
  private currentModule: string | null = null
  private previousModule: string | null = null
  private sessionOnce = new Set<string>()
  private flushing = false
  private timerId: number | null = null
  private initialized = false

  init(): void {
    if (this.initialized) return
    this.initialized = true

    // Restore pending events from a previous session (crash / kill recovery)
    this.restoreQueue()

    // Primary flush trigger: app goes to background
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush()
    })

    // Connectivity restored → flush pending queue
    window.addEventListener('online', () => this.flush())

    // Capacitor native lifecycle (native background)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { App } = require('@capacitor/app')
      App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (!state.isActive) this.flush()
      })
    } catch {
      // Web/PWA: visibilitychange covers it
    }

    // Safety-net timer for quiet foreground sessions
    this.timerId = window.setInterval(() => {
      if (this.queue.length > 0) this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  /** Bind events to the current app session (from useSessionTracker). */
  setSession(sessionId: string | null): void {
    this.sessionId = sessionId
    if (sessionId === null) this.sessionOnce.clear()
  }

  /**
   * Track a main module opening (router-level).
   * Emits main_module_opened with the previous module of this session,
   * then updates the module chain.
   */
  trackModule(module: string): void {
    if (this.currentModule !== module) {
      this.track('main_module_opened', {
        module,
        previous_module: this.previousModule ?? this.currentModule
      }, TELEMETRY_PRIORITY.LOW)
      this.previousModule = this.currentModule
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
    if (this.sessionOnce.has(eventName)) return
    this.sessionOnce.add(eventName)
    this.track(eventName, properties, TELEMETRY_PRIORITY.LOW)
  }

  /**
   * Enqueue an event. Synchronous, never throws, never blocks.
   */
  track(eventName: string, properties: Record<string, unknown> = {}, priority: number = TELEMETRY_PRIORITY.MEDIUM): void {
    try {
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
      this.persistQueue()
      if (this.queue.length >= FLUSH_THRESHOLD) this.flush()
    } catch {
      // Telemetry must never break the app (PRD §4.1)
    }
  }

  /** Force-send the current queue. Fire-and-forget, safe to call anywhere. */
  flush(): void {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    const batch = this.queue.slice(0, MAX_BATCH)
    const batchIds = new Set(batch.map(e => e.event_id))

    void rpc('fn_telemetry_ingest', { p_events: batch })
      .then(() => {
        // Remove only the events actually sent (new ones may have arrived meanwhile)
        this.queue = this.queue.filter(e => !batchIds.has(e.event_id))
        this.persistQueue()
      })
      .catch(() => {
        // Keep queue; retry on next trigger. Never surface to the user.
      })
      .finally(() => {
        this.flushing = false
        // If more events accumulated beyond one batch, keep draining
        if (this.queue.length > 0) this.flush()
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

  private persistQueue(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue))
    } catch {
      // localStorage full/unavailable → memory queue still works
    }
  }

  private restoreQueue(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.queue = parsed.filter((e: TelemetryEvent) =>
          e && typeof e.event_id === 'string' && typeof e.event_name === 'string'
        )
      }
      localStorage.removeItem(STORAGE_KEY)
      // Pending events from a dead session: send immediately
      if (this.queue.length > 0) this.flush()
    } catch {
      // Corrupted backup → discard, telemetry must never harm the app
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    }
  }
}

export const telemetry = new TelemetryService()
telemetry.init()