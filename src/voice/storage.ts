// src/voice/storage.ts
// ============================================
// Voice v1 - Local persistence of in-flight voice jobs
// ============================================

/** localStorage key holding the active voice job snapshots. */
export const VOICE_STORAGE_KEY = 'ord.voice.v1.active_jobs' as const;

/** Jobs older than this window are treated as abandoned by the frontend. */
export const RESUME_WINDOW_MS = 10 * 60 * 1000;

/** Minimal snapshot persisted for a job that is still in flight. */
export interface StoredVoiceJob {
  job_id: string;
  created_at: string;
  idempotency_key: string;
}

/**
 * In-memory fallback used when localStorage is unavailable
 * (SSR, private mode, or a test environment without a DOM).
 */
const memoryStore = new Map<string, string>();

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing localStorage can throw in sandboxed / private contexts.
    return null;
  }
}

function readRaw(): string | null {
  const storage = getLocalStorage();
  if (!storage) return memoryStore.get(VOICE_STORAGE_KEY) ?? null;
  try {
    return storage.getItem(VOICE_STORAGE_KEY);
  } catch {
    return memoryStore.get(VOICE_STORAGE_KEY) ?? null;
  }
}

function writeRaw(value: string | null): void {
  const storage = getLocalStorage();
  if (storage) {
    try {
      if (value === null) {
        storage.removeItem(VOICE_STORAGE_KEY);
      } else {
        storage.setItem(VOICE_STORAGE_KEY, value);
      }
      return;
    } catch {
      // Quota exceeded or private mode: keep the in-memory mirror in sync.
    }
  }
  if (value === null) {
    memoryStore.delete(VOICE_STORAGE_KEY);
  } else {
    memoryStore.set(VOICE_STORAGE_KEY, value);
  }
}

function isStoredVoiceJob(value: unknown): value is StoredVoiceJob {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.job_id === 'string' &&
    candidate.job_id.length > 0 &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.idempotency_key === 'string'
  );
}

/** Reads the persisted jobs. Corrupted or non-array payloads resolve to an empty list. */
export function loadStoredVoiceJobs(): StoredVoiceJob[] {
  const raw = readRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredVoiceJob);
  } catch {
    return [];
  }
}

function saveStoredVoiceJobs(jobs: StoredVoiceJob[]): void {
  if (jobs.length === 0) {
    writeRaw(null);
    return;
  }
  writeRaw(JSON.stringify(jobs));
}

/** Adds or replaces a persisted job, keyed by `job_id`. */
export function addStoredVoiceJob(job: StoredVoiceJob): void {
  const jobs = loadStoredVoiceJobs().filter((existing) => existing.job_id !== job.job_id);
  jobs.push(job);
  saveStoredVoiceJobs(jobs);
}

/** Removes a persisted job, if present. */
export function removeStoredVoiceJob(jobId: string): void {
  const jobs = loadStoredVoiceJobs();
  const remaining = jobs.filter((job) => job.job_id !== jobId);
  if (remaining.length === jobs.length) return;
  saveStoredVoiceJobs(remaining);
}

/**
 * Drops jobs whose `created_at` is older than `maxAgeMs` (default: the resume
 * window) and returns how many were dropped. Jobs with an unparseable
 * `created_at` cannot be resumed safely, so they are dropped as well.
 */
export function clearStaleStoredVoiceJobs(maxAgeMs: number = RESUME_WINDOW_MS): number {
  const jobs = loadStoredVoiceJobs();
  const now = Date.now();
  const fresh = jobs.filter((job) => {
    const createdAt = Date.parse(job.created_at);
    return Number.isFinite(createdAt) && now - createdAt <= maxAgeMs;
  });
  const removed = jobs.length - fresh.length;
  if (removed > 0) saveStoredVoiceJobs(fresh);
  return removed;
}
