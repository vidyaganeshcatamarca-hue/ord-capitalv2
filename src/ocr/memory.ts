import { registerCategoryMemory, type RegisterCategoryMemoryInput } from './apiClient';
import { TELEMETRY_PRIORITY } from '@/lib/telemetry';
import {
  collectCategoryCorrections,
  effectiveSavedCategory,
  isNonLearnableCategory,
  type OcrCategoryCorrection,
  type OcrCategoryNameResolver,
} from './memoryRules';
import { loadPendingOcrMemory, queuePendingOcrMemory, type PendingOcrMemory } from './storage';
import { runPendingMemorySync, type PendingMemorySyncResult } from './memorySync';
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

export type SyncPendingOcrMemoryResult = PendingMemorySyncResult;

/**
 * Retries every queued correction (PRD §24). A failure keeps the entry for the
 * next attempt and reports `memory_sync` telemetry; the quarantine draft is
 * never rolled back because of it.
 */
export async function syncPendingOcrMemory(
  input: SyncPendingOcrMemoryInput
): Promise<SyncPendingOcrMemoryResult> {
  const { accessToken, jobId, signal } = input;

  // The rules (2xx confirms, failure keeps, never duplicates) live in
  // `memorySync.ts` so they are testable; this wrapper only wires the real
  // network call and the telemetry.
  const result = await runPendingMemorySync({
    accessToken,
    jobId,
    register: (entry) =>
      registerCategoryMemory({
        jobId: entry.jobId,
        itemIndex: entry.itemIndex,
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        categoryParentName: entry.categoryParentName,
        accessToken,
        signal,
      }),
  });

  for (const failure of result.failures) {
    trackOcrError('memory_sync', failure.code, { job_id: failure.job_id });
  }

  if (result.synced > 0) {
    trackOcrEvent(
      OCR_EVENTS.categoryCorrected,
      {
        job_id: jobId,
        changed_item_count: result.synced,
        memory_synced: result.failed === 0,
      },
      TELEMETRY_PRIORITY.MEDIUM
    );
  }

  return result;
}

/** Queued corrections still waiting, for the UI hint. */
export function pendingMemoryCount(jobId?: string): number {
  const all = loadPendingOcrMemory().value;
  return jobId ? all.filter((entry) => entry.job_id === jobId).length : all.length;
}

export type { PendingOcrMemory };
