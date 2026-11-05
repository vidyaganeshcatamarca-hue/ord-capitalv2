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

/** Job snapshots still being followed. */
export const OCR_JOBS_STORAGE_KEY = 'ord.ocr.v1.active_jobs' as const;

/** Category corrections the backend has not acknowledged yet. */
export const OCR_PENDING_MEMORY_STORAGE_KEY = 'ord.ocr.v1.pending_memory' as const;

/** Bookkeeping of the periodic local cleanup. */
export const OCR_CACHE_MAINTENANCE_STORAGE_KEY = 'ord.ocr.v1.cache_maintenance' as const;

/** Minimal snapshot persisted for a job that is still in flight (PRD §81). */
export interface StoredOcrJob {
  job_id: string;
  created_at: string;
  last_status: OcrJobStatus | null;
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
  return patchOcrJob(jobId, { last_error_code: null });
}

/** Records the stable code of the failure that stopped this job. */
export function recordOcrJobError(jobId: string, code: string): { durable: boolean } {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (trimmed === '') return { durable: true };
  return patchOcrJob(jobId, { last_error_code: trimmed });
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
  if (!serverCreatedAt || !dispatchedAt) return null;
  const start = Date.parse(serverCreatedAt);
  const end = Date.parse(dispatchedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const delta = end - start;
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
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    last_status: (value.last_status ?? null) as OcrJobStatus | null,
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
    server_created_at:
      typeof value.server_created_at === 'string' && value.server_created_at !== ''
        ? value.server_created_at
        : null,
    quarantine_dispatched_at:
      typeof value.quarantine_dispatched_at === 'string' && value.quarantine_dispatched_at !== ''
        ? value.quarantine_dispatched_at
        : null,
  };
}

/** Reads every followed job. Corrupted payloads resolve to an empty list. */
export function loadOcrJobs(): StorageRead<StoredOcrJob[]> {
  const { raw, durable } = readRaw(OCR_JOBS_STORAGE_KEY);
  const jobs = parseArray(raw).filter(isStoredOcrJob).map(normalizeStoredJob);
  return { value: jobs, durable };
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
  jobs[index] = { ...jobs[index], ...patch };
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
