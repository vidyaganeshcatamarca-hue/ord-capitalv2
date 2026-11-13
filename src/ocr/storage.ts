// src/ocr/storage.ts
// ============================================
// OCR v1 - Local persistence of jobs, pending memory and cache maintenance
// ============================================
//
// Normative source: definitive PRD §39, §40, §75, §80-§82, §95.
//
// Completely separate from Voice storage: `ord.ocr.v1.*` keys, no shared shape,
// no shared resume window. An OCR job lives until its terminal status AND its
// quarantine dispatch both happened (§40), and that can legitimately take days,
// so there is no age cutoff here (unlike Voice's 10-minute window).
//
// Every read validates its payload: corrupted storage must degrade to "nothing
// pending", never break the app (§80).

import type { OcrJobStatus } from './types';

/**
 * Terminal statuses as a VALUE.
 *
 * `src/ocr/types.ts` is imported with `import type` on purpose: a runtime import
 * without an extension cannot be resolved by Node's ESM loader, which is how the
 * storage test suite loads this module. Keeping the list here (and asserting it
 * matches `OCR_TERMINAL_STATUSES` in the ownership test) avoids both a broken
 * test bootstrap and a silent divergence.
 */
export const OCR_STORAGE_TERMINAL_STATUSES: readonly OcrJobStatus[] = [
  'completed',
  'needs_review',
  'failed',
  'cancelled',
];

function isTerminalStatus(status: OcrJobStatus | null): boolean {
  return status !== null && OCR_STORAGE_TERMINAL_STATUSES.includes(status);
}

/** Job snapshots still being followed. */
export const OCR_JOBS_STORAGE_KEY = 'ord.ocr.v1.active_jobs' as const;

/** Category corrections the backend has not acknowledged yet. */
export const OCR_PENDING_MEMORY_STORAGE_KEY = 'ord.ocr.v1.pending_memory' as const;

/** Bookkeeping of the periodic local cleanup. */
export const OCR_CACHE_MAINTENANCE_STORAGE_KEY = 'ord.ocr.v1.cache_maintenance' as const;

/** Minimal snapshot persisted for a job that is still in flight (PRD §81). */
export interface StoredOcrJob {
  job_id: string;
  /**
   * Supabase user id that owns the ticket on this device.
   *
   * The backend answers a poll with `job_id + user_id`, so a job persisted by
   * another account can only ever return 404 here. Storing the owner is what
   * lets this client stop polling work that is no longer its own instead of
   * hammering an endpoint that is right to refuse it.
   *
   * `null` means legacy: the row was written before this field existed, so its
   * owner is genuinely unknown and must never be assumed to be the current one.
   */
  owner_user_id: string | null;
  created_at: string;
  last_status: OcrJobStatus | null;
  /**
   * Finer backend phase inside `processing` (for example `extracting`), when the
   * backend publishes one. Traceability only: an absent stage is not an error
   * and never changes the owner-facing text on its own.
   */
  last_stage: string | null;
  last_checked_at: string | null;
  /** True once the quarantine row exists for this job (PRD §40). */
  quarantine_dispatched: boolean;
  /** Local quarantine row id, so a re-dispatch can reuse it. */
  pendiente_id: number | null;
  /**
   * Stable code of the last failure in this job's pipeline, or null when the
   * last attempt succeeded.
   *
   * Without it a failed polling or dispatch lived only in React state: after a
   * reload the job looked identical to "nothing happened yet", which is exactly
   * how a dead dispatch stays invisible for hours. The code is enough to
   * diagnose; no stack traces or free-form messages are stored (PRD §80).
   */
  last_error_code: string | null;
  /** When `last_error_code` was recorded, so a stale code is distinguishable. */
  last_error_at: string | null;
  /**
   * Last GET that answered 2xx. Deliberately separate from `last_checked_at`:
   * a failed attempt updates the latter but must not move this stamp, which is
   * the only proof that the backend is still answering for this job.
   */
  last_successful_poll_at: string | null;
  /**
   * When the BACKEND says it received the ticket (the `created_at` of the job),
   * not when the browser started uploading. The two are deliberately different:
   * a 20 MB upload is not backend latency.
   */
  server_created_at: string | null;
  /** When this client created the quarantine row from the finished job. */
  quarantine_dispatched_at: string | null;
}

/** One explicit correction waiting to be acknowledged (PRD §24). */
export interface PendingOcrMemory {
  job_id: string;
  item_index: number;
  category_id: string;
  category_name: string;
  category_parent_name: string | null;
  created_at: string;
}

/** Result of reading a storage key: the value plus whether storage worked. */
export interface StorageRead<T> {
  value: T;
  /** False when the persistence layer itself is unavailable (private mode). */
  durable: boolean;
}

const memoryStore = new Map<string, string>();

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing localStorage throws in sandboxed contexts.
    return null;
  }
}

function readRaw(key: string): { raw: string | null; durable: boolean } {
  const storage = getLocalStorage();
  if (!storage) return { raw: memoryStore.get(key) ?? null, durable: false };
  try {
    return { raw: storage.getItem(key), durable: true };
  } catch {
    return { raw: memoryStore.get(key) ?? null, durable: false };
  }
}

function writeRaw(key: string, value: string | null): { durable: boolean } {
  const storage = getLocalStorage();
  if (storage) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      memoryStore.set(key, value ?? '');
      return { durable: true };
    } catch {
      // Quota exceeded or private mode: keep the in-memory mirror usable.
    }
  }
  if (value === null) memoryStore.delete(key);
  else memoryStore.set(key, value);
  return { durable: false };
}

function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isStoredOcrJob(value: unknown): value is StoredOcrJob {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.job_id === 'string' && candidate.job_id.length > 0;
}

/** Normalizes a stored row so a partial payload never leaks undefined to the UI. */
/**
 * Clears the failure once the same stage succeeds again, so a stale code never
 * outlives the problem it described.
 */
export function clearOcrJobError(jobId: string): { durable: boolean } {
  // The timestamp belongs to the code: clearing one without the other leaves a
  // row claiming a failure happened at an unknown moment.
  return patchOcrJob(jobId, { last_error_code: null, last_error_at: null });
}

/** Records the stable code of the failure that stopped this job. */
export function recordOcrJobError(jobId: string, code: string): { durable: boolean } {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (trimmed === '') return { durable: true };
  return patchOcrJob(jobId, {
    last_error_code: trimmed,
    last_error_at: new Date().toISOString(),
  });
}

/**
 * Absolute instant in UTC, from a backend or client stamp.
 *
 * The app is reachable from any timezone and each server reports its own
 * offset, so every stamp is normalized to UTC before being stored or compared.
 * A stamp WITHOUT an explicit offset is read as UTC on purpose: `Date.parse`
 * would otherwise read it as local time and invent a difference of whole hours.
 */
export function toUtcIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '') return null;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const parsed = Date.parse(hasOffset ? raw : `${raw}Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Backend receipt -> quarantine dispatch, in milliseconds.
 *
 * Returns null when either stamp is missing or unparseable, and also when the
 * result would be negative (client and server clocks disagreeing is not a
 * latency). An unknown latency is never reported as zero.
 */
export function ocrQuarantineLatencyMs(
  serverCreatedAt: string | null,
  dispatchedAt: string | null
): number | null {
  const start = toUtcIso(serverCreatedAt);
  const end = toUtcIso(dispatchedAt);
  if (!start || !end) return null;
  const delta = Date.parse(end) - Date.parse(start);
  return delta >= 0 ? delta : null;
}

/** Same measurement for one followed job, or null when it is not available. */
export function readOcrQuarantineLatencyMs(jobId: string): number | null {
  const job = loadOcrJobs().value.find((entry) => entry.job_id === jobId);
  if (!job) return null;
  return ocrQuarantineLatencyMs(job.server_created_at, job.quarantine_dispatched_at);
}

function normalizeStoredJob(value: StoredOcrJob): StoredOcrJob {
  return {
    job_id: value.job_id,
    // An absent owner stays absent: assuming the current user would silently
    // hand a stranger's ticket to whoever opened the app next (§S5).
    owner_user_id:
      typeof value.owner_user_id === 'string' && value.owner_user_id.trim() !== ''
        ? value.owner_user_id.trim()
        : null,
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    last_status: (value.last_status ?? null) as OcrJobStatus | null,
    last_stage:
      typeof value.last_stage === 'string' && value.last_stage.trim() !== ''
        ? value.last_stage.trim()
        : null,
    last_checked_at: typeof value.last_checked_at === 'string' ? value.last_checked_at : null,
    quarantine_dispatched: value.quarantine_dispatched === true,
    pendiente_id:
      typeof value.pendiente_id === 'number' && Number.isFinite(value.pendiente_id)
        ? value.pendiente_id
        : null,
    // Jobs persisted before this field existed hydrate as "no error", which is
    // the only honest reading of an absent history.
    last_error_code:
      typeof value.last_error_code === 'string' && value.last_error_code.trim() !== ''
        ? value.last_error_code
        : null,
    last_error_at: toUtcIso(value.last_error_at),
    last_successful_poll_at: toUtcIso(value.last_successful_poll_at),
    // Normalized to UTC on every read and write, whatever offset came in.
    server_created_at: toUtcIso(value.server_created_at),
    quarantine_dispatched_at: toUtcIso(value.quarantine_dispatched_at),
  };
}

/**
 * Failures that describe the SESSION, not the job.
 *
 * The backend answers a poll with `job_id + user_id` and deliberately does not
 * distinguish "no such job" from "someone else's job" (both are 404). That 404
 * is therefore a fact about whoever is signed in, not about the ticket: it must
 * never be written as a permanent job outcome, because the real owner signing
 * back in would find a ticket that can never be resumed.
 */
export const OCR_SESSION_ERROR_CODES = ['NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN'] as const;

export function isOcrSessionErrorCode(code: string | null | undefined): boolean {
  if (typeof code !== 'string') return false;
  return (OCR_SESSION_ERROR_CODES as readonly string[]).includes(code.trim());
}

/**
 * The rows this owner may resume right now.
 *
 * Partitioning is a strict filter on `owner_user_id` over one shared collection:
 * the existing code already reads and writes a single array keyed by `job_id`,
 * so a per-user storage key would have meant rewriting every read path for no
 * behavioural gain.
 *
 * Rules, in order:
 *   - another owner's row is never selected;
 *   - a legacy row (owner unknown) is selected so a single GET can prove whose
 *     it is, and adopted only if the backend confirms;
 *   - an already confirmed quarantine has nothing left to do;
 *   - a business-terminal job is not polled again, UNLESS the last failure was a
 *     session error: 404 -> owner returns -> 200 -> dispatch must still happen.
 */
export function selectResumableOcrJobs(
  jobs: readonly StoredOcrJob[],
  ownerUserId: string | null
): StoredOcrJob[] {
  if (!ownerUserId) return [];
  return jobs.filter((job) => {
    if (job.owner_user_id !== null && job.owner_user_id !== ownerUserId) return false;
    if (job.quarantine_dispatched && job.pendiente_id !== null) return false;
    const blockedBySession = isOcrSessionErrorCode(job.last_error_code);
    if (!blockedBySession && isTerminalStatus(job.last_status)) {
      return false;
    }
    return true;
  });
}

/** Reads every followed job. Corrupted payloads resolve to an empty list. */
export function loadOcrJobs(): StorageRead<StoredOcrJob[]> {
  const { raw, durable } = readRaw(OCR_JOBS_STORAGE_KEY);
  const jobs = parseArray(raw).filter(isStoredOcrJob).map(normalizeStoredJob);
  return { value: jobs, durable };
}

/**
 * Jobs this owner may safely poll.
 *
 * Legacy rows (no owner) are deliberately excluded: the client cannot prove
 * they belong to the signed-in user, and polling them is exactly what produced
 * a 404 storm in the incident. They are resumed by the caller with a single
 * opportunistic GET and adopted only if the backend confirms them.
 */
export function loadOcrJobsForOwner(ownerUserId: string | null): StorageRead<StoredOcrJob[]> {
  const all = loadOcrJobs();
  if (!ownerUserId) return { value: [], durable: all.durable };
  return {
    value: all.value.filter((job) => job.owner_user_id === ownerUserId),
    durable: all.durable,
  };
}

/** Rows written before owner tracking: owner unknown, never assumed. */
export function loadLegacyOcrJobs(): StorageRead<StoredOcrJob[]> {
  const all = loadOcrJobs();
  return { value: all.value.filter((job) => job.owner_user_id === null), durable: all.durable };
}

/**
 * Binds a legacy row to an owner AFTER the backend proved the ticket is theirs.
 * Adoption is evidence-based: a 200 on the poll, never an inference.
 */
export function adoptOcrJobOwner(jobId: string, ownerUserId: string): { durable: boolean } {
  const owner = typeof ownerUserId === 'string' ? ownerUserId.trim() : '';
  if (owner === '') return { durable: true };
  return patchOcrJob(jobId, { owner_user_id: owner });
}

function saveOcrJobs(jobs: readonly StoredOcrJob[]): { durable: boolean } {
  if (jobs.length === 0) return writeRaw(OCR_JOBS_STORAGE_KEY, null);
  return writeRaw(OCR_JOBS_STORAGE_KEY, JSON.stringify(jobs));
}

/** Adds or replaces a job, keyed by `job_id`. */
export function upsertOcrJob(job: StoredOcrJob): { durable: boolean } {
  const jobs = loadOcrJobs().value.filter((existing) => existing.job_id !== job.job_id);
  jobs.push(normalizeStoredJob(job));
  return saveOcrJobs(jobs);
}

/** Patches one job in place. Returns the durability of the write. */
export function patchOcrJob(
  jobId: string,
  patch: Partial<Omit<StoredOcrJob, 'job_id'>>
): { durable: boolean } {
  const jobs = loadOcrJobs().value;
  const index = jobs.findIndex((job) => job.job_id === jobId);
  if (index < 0) return { durable: true };
  // Normalizing here keeps the stored payload canonical (UTC, validated) even
  // when the caller hands us a raw backend stamp.
  jobs[index] = normalizeStoredJob({ ...jobs[index], ...patch });
  return saveOcrJobs(jobs);
}

/** Removes one job from the followed set. */
export function removeOcrJob(jobId: string): { durable: boolean } {
  const jobs = loadOcrJobs().value;
  const remaining = jobs.filter((job) => job.job_id !== jobId);
  if (remaining.length === jobs.length) return { durable: true };
  return saveOcrJobs(remaining);
}

/**
 * Drops the local job once it is both terminal and dispatched (PRD §40, §82).
 * A `completed` job whose quarantine never landed is deliberately kept.
 */
export function pruneDispatchedOcrJobs(): { removed: number; durable: boolean } {
  const jobs = loadOcrJobs().value;
  const remaining = jobs.filter((job) => !(job.quarantine_dispatched && job.pendiente_id !== null));
  const removed = jobs.length - remaining.length;
  if (removed === 0) return { removed, durable: true };
  return { removed, durable: saveOcrJobs(remaining).durable };
}

function isPendingMemory(value: unknown): value is PendingOcrMemory {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.job_id === 'string' &&
    candidate.job_id.length > 0 &&
    typeof candidate.item_index === 'number' &&
    typeof candidate.category_id === 'string' &&
    candidate.category_id.length > 0
  );
}

/** Reads the corrections still waiting for the backend. */
export function loadPendingOcrMemory(): StorageRead<PendingOcrMemory[]> {
  const { raw, durable } = readRaw(OCR_PENDING_MEMORY_STORAGE_KEY);
  const entries = parseArray(raw).filter(isPendingMemory).map((entry) => ({
    job_id: entry.job_id,
    item_index: entry.item_index,
    category_id: entry.category_id,
    category_name: typeof entry.category_name === 'string' ? entry.category_name : '',
    category_parent_name:
      typeof entry.category_parent_name === 'string' ? entry.category_parent_name : null,
    created_at: typeof entry.created_at === 'string' ? entry.created_at : new Date().toISOString(),
  }));
  return { value: entries, durable };
}

function savePendingOcrMemory(entries: readonly PendingOcrMemory[]): { durable: boolean } {
  if (entries.length === 0) return writeRaw(OCR_PENDING_MEMORY_STORAGE_KEY, null);
  return writeRaw(OCR_PENDING_MEMORY_STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Queues one correction. Keyed by `job_id` + `item_index` so retrying the sync
 * can never duplicate the same correction (PRD §24: "no crear duplicados al
 * reintentar").
 */
export function queuePendingOcrMemory(entry: PendingOcrMemory): { durable: boolean } {
  const entries = loadPendingOcrMemory().value.filter(
    (existing) => !(existing.job_id === entry.job_id && existing.item_index === entry.item_index)
  );
  entries.push(entry);
  return savePendingOcrMemory(entries);
}

/** Drops one queued correction, after the backend acknowledged it. */
export function resolvePendingOcrMemory(jobId: string, itemIndex: number): { durable: boolean } {
  const entries = loadPendingOcrMemory().value;
  const remaining = entries.filter(
    (existing) => !(existing.job_id === jobId && existing.item_index === itemIndex)
  );
  if (remaining.length === entries.length) return { durable: true };
  return savePendingOcrMemory(remaining);
}

/** Last time the periodic image cleanup ran (ms since epoch), or null. */
export function readOcrCacheMaintenanceAt(): number | null {
  const { raw } = readRaw(OCR_CACHE_MAINTENANCE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { last_cleanup_at?: unknown };
    return typeof parsed.last_cleanup_at === 'number' && Number.isFinite(parsed.last_cleanup_at)
      ? parsed.last_cleanup_at
      : null;
  } catch {
    return null;
  }
}

/** Records the periodic image cleanup (PRD §45 A). */
export function writeOcrCacheMaintenanceAt(timestampMs: number): { durable: boolean } {
  return writeRaw(OCR_CACHE_MAINTENANCE_STORAGE_KEY, JSON.stringify({ last_cleanup_at: timestampMs }));
}

/** True when the periodic cleanup has gone ~30 days without running. */
export const OCR_CACHE_MAINTENANCE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export function isOcrCacheMaintenanceDue(nowMs: number = Date.now()): boolean {
  const last = readOcrCacheMaintenanceAt();
  if (last === null) return true;
  return nowMs - last >= OCR_CACHE_MAINTENANCE_INTERVAL_MS;
}
