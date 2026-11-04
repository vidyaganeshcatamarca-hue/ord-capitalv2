import { registerCategoryMemory, type RegisterCategoryMemoryInput } from './apiClient';
import { TELEMETRY_PRIORITY } from '@/lib/telemetry';
import {
  collectCategoryCorrections,
  effectiveSavedCategory,
  isNonLearnableCategory,
  type OcrCategoryCorrection,
  type OcrCategoryNameResolver,
} from './memoryRules';
import {
  loadPendingOcrMemory,
  queuePendingOcrMemory,
  resolvePendingOcrMemory,
  type PendingOcrMemory,
} from './storage';
import { trackOcrError, trackOcrEvent, OCR_EVENTS } from './telemetry';

// The pure rules live in `memoryRules.ts` so they are testable without a
// browser; this module owns the side effects (queue + backend sync).
export {
  collectCategoryCorrections,
  effectiveSavedCategory,
  isNonLearnableCategory,
};
export type { OcrCategoryCorrection, OcrCategoryNameResolver };

/** Stages the corrections for the pending queue (never throws). */
export function queueCorrections(jobId: string, corrections: readonly OcrCategoryCorrection[]): void {
  if (!jobId) return;
  for (const correction of corrections) {
    queuePendingOcrMemory({
      job_id: jobId,
      item_index: correction.item_index,
      category_id: correction.category_id,
      category_name: correction.category_name,
      category_parent_name: correction.category_parent_name,
      created_at: new Date().toISOString(),
    });
  }
}

export interface SyncPendingOcrMemoryInput {
  accessToken: string;
  /** Only this job's entries are retried when provided. */
  jobId?: string;
  signal?: AbortSignal;
}

export interface SyncPendingOcrMemoryResult {
  attempted: number;
  synced: number;
  failed: number;
}

/**
 * Retries every queued correction (PRD §24). A failure keeps the entry for the
 * next attempt and reports `memory_sync` telemetry; the quarantine draft is
 * never rolled back because of it.
 */
export async function syncPendingOcrMemory(
  input: SyncPendingOcrMemoryInput
): Promise<SyncPendingOcrMemoryResult> {
  const { accessToken, jobId, signal } = input;
  const all = loadPendingOcrMemory().value;
  const pending = jobId ? all.filter((entry) => entry.job_id === jobId) : all;

  if (pending.length === 0) return { attempted: 0, synced: 0, failed: 0 };
  if (!accessToken) {
    return { attempted: pending.length, synced: 0, failed: pending.length };
  }

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    const payload: RegisterCategoryMemoryInput = {
      jobId: entry.job_id,
      itemIndex: entry.item_index,
      categoryId: entry.category_id,
      categoryName: entry.category_name,
      categoryParentName: entry.category_parent_name,
      accessToken,
      signal,
    };
    try {
      await registerCategoryMemory(payload);
      resolvePendingOcrMemory(entry.job_id, entry.item_index);
      synced += 1;
    } catch (error) {
      failed += 1;
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? 'UNKNOWN')
          : 'UNKNOWN';
      trackOcrError('memory_sync', code, { job_id: entry.job_id });
    }
  }

  trackOcrEvent(
    OCR_EVENTS.categoryCorrected,
    { job_id: jobId, changed_item_count: synced, memory_synced: failed === 0 },
    TELEMETRY_PRIORITY.MEDIUM
  );

  return { attempted: pending.length, synced, failed };
}

/** Queued corrections still waiting, for the UI hint. */
export function pendingMemoryCount(jobId?: string): number {
  const all = loadPendingOcrMemory().value;
  return jobId ? all.filter((entry) => entry.job_id === jobId).length : all.length;
}

export type { PendingOcrMemory };
