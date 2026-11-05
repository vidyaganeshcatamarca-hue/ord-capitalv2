// src/ocr/memorySync.ts
// ============================================
// OCR v1 - Pending category-memory sync (pure orchestration, no browser deps)
// ============================================
//
// Contract with the backend: ANY 2xx confirms the correction. There is no
// `confirmed` flag in the body to look for, so the only correct rule is
// "request succeeded -> drop the queued entry". A failure keeps it for the next
// sync (PRD §24).
//
// This module exists on its own because `memory.ts` pulls the app's telemetry
// and alias imports (`@/lib/telemetry`), which plain Node cannot resolve; the
// rules that actually need testing live here with the side effects injected.

import { loadPendingOcrMemory, resolvePendingOcrMemory } from './storage.ts';

/** One correction as the backend expects it. */
export interface PendingMemorySyncEntry {
  jobId: string;
  itemIndex: number;
  categoryId: string;
  categoryName: string;
  categoryParentName: string | null;
}

export interface PendingMemorySyncInput {
  accessToken: string;
  /** Only this job's entries are retried when provided. */
  jobId?: string;
  /** Injected so the rules are testable without a network or a session. */
  register: (entry: PendingMemorySyncEntry) => Promise<unknown>;
}

/** A failure worth reporting, with the stable code that caused it. */
export interface PendingMemorySyncFailure {
  job_id: string;
  item_index: number;
  code: string;
}

export interface PendingMemorySyncResult {
  attempted: number;
  synced: number;
  failed: number;
  /** Jobs whose corrections are now confirmed (error code can be cleared). */
  syncedJobIds: string[];
  /** Jobs with at least one failure (error code must be recorded). */
  failedJobIds: string[];
  failures: PendingMemorySyncFailure[];
}

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '') return code;
  }
  return 'UNKNOWN';
}

/**
 * Pushes every queued correction, removing each one the backend accepted.
 *
 * Ordering matters: the entry is removed only AFTER the request succeeded, so a
 * crash between the two leaves a retry rather than a lost correction. Removing
 * twice for the same `job_id` + `item_index` is a no-op by construction, which
 * is what keeps retries from duplicating a confirmed correction.
 */
export async function runPendingMemorySync(
  input: PendingMemorySyncInput
): Promise<PendingMemorySyncResult> {
  const { accessToken, jobId, register } = input;
  const all = loadPendingOcrMemory().value;
  const pending = jobId ? all.filter((entry) => entry.job_id === jobId) : all;

  const result: PendingMemorySyncResult = {
    attempted: pending.length,
    synced: 0,
    failed: 0,
    syncedJobIds: [],
    failedJobIds: [],
    failures: [],
  };

  if (pending.length === 0) return result;
  if (!accessToken) {
    // No session: nothing is lost, nothing is claimed as synced.
    result.failed = pending.length;
    result.failedJobIds = Array.from(new Set(pending.map((entry) => entry.job_id)));
    return result;
  }

  for (const entry of pending) {
    try {
      await register({
        jobId: entry.job_id,
        itemIndex: entry.item_index,
        categoryId: entry.category_id,
        categoryName: entry.category_name,
        categoryParentName: entry.category_parent_name,
      });
      // 2xx reached this line: the correction is confirmed, so drop it now and
      // persist immediately (not on the next tick).
      resolvePendingOcrMemory(entry.job_id, entry.item_index);
      result.synced += 1;
      if (!result.syncedJobIds.includes(entry.job_id)) result.syncedJobIds.push(entry.job_id);
    } catch (error) {
      result.failed += 1;
      if (!result.failedJobIds.includes(entry.job_id)) result.failedJobIds.push(entry.job_id);
      result.failures.push({
        job_id: entry.job_id,
        item_index: entry.item_index,
        code: codeOf(error),
      });
    }
  }

  return result;
}
