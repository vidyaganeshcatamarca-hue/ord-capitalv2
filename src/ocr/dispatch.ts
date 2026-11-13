// src/ocr/dispatch.ts
// ============================================
// OCR v1 - Quarantine dispatch, one row per finished job
// ============================================
//
// Normative source: definitive PRD §40, §77, §91-§92.
//
// Why this lives outside the hook: the dispatch is the only place where several
// finished jobs compete for the same quarantine tray, and a React hook cannot be
// exercised by the test that pins that race. Extracting it keeps ONE
// implementation and makes the concurrency contract observable.
//
// Contracts honoured here:
//   - the guard is keyed by `job_id`, never by a global flag, so job A can never
//     be blocked, cancelled or re-marked by job B;
//   - the guard is set BEFORE the first await, so a double invocation (StrictMode
//     or two concurrent polls) creates exactly one quarantine row;
//   - the guard is RELEASED on failure, so a later retry can still land the
//     ticket instead of leaving a job nobody can review;
//   - the terminal state is persisted BEFORE the RPC: if the app dies mid-call,
//     the next mount finds a finished job, not one that never started;
//   - a finished job without a ticket fails loudly instead of returning silently,
//     which is how the 00:53 incident stayed invisible on "Procesando";
//   - `completed` and `needs_review` are one path, because both are dispatch
//     statuses and nothing here branches on which one it was.

import type { OcrJob } from './types';

/** Local quarantine row created for a finished job. */
export interface OcrQuarantineRow {
  pendiente_id: number;
}

export interface OcrDispatchDeps {
  /** Creates (or reuses) the quarantine row. This is the only network call. */
  createQuarantine(input: {
    jobId: string;
    ticket: NonNullable<OcrJob['ticket']>;
    originalResult: OcrJob['raw_result'];
  }): Promise<OcrQuarantineRow>;
  /** Runs before the RPC: the job is finished and that fact must survive a crash. */
  onTerminalPersisted(job: OcrJob): void;
  /** Runs only after the quarantine row was confirmed. */
  onDispatched(job: OcrJob, pendienteId: number): void;
  /** Runs for any failure, including a finished job with no ticket. */
  onFailed(job: OcrJob, code: string): void;
  /** Optional: starts the image retention window. */
  markImagesProcessed?: (jobId: string) => void;
  /** Optional: tells the tray to refresh from any screen. */
  announce?: () => void;
}

export interface OcrDispatcher {
  /** Dispatches one finished job. Returns true when the row exists. */
  dispatch(job: OcrJob): Promise<boolean>;
  /** True while this job's RPC is in flight. */
  isInFlight(jobId: string): boolean;
  /** Releases the guard so a retry can run (used by retryDispatch). */
  release(jobId: string): void;
  /** Drops every guard (account change). */
  reset(): void;
}

export function createOcrDispatcher(deps: OcrDispatchDeps): OcrDispatcher {
  const inFlight = new Set<string>();

  const codeOf = (error: unknown): string => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const value = (error as { code?: unknown }).code;
      if (value !== undefined && value !== null && String(value) !== '') return String(value);
    }
    return 'DISPATCH_FAILED';
  };

  return {
    isInFlight: (jobId) => inFlight.has(jobId),

    release: (jobId) => {
      inFlight.delete(jobId);
    },

    reset: () => {
      inFlight.clear();
    },

    async dispatch(job: OcrJob): Promise<boolean> {
      const jobId = job.job_id;

      // Already handed over (or being handed over right now): success, no-op.
      if (inFlight.has(jobId)) return true;

      // Persisted before anything can fail, so a crash here leaves a finished
      // job on disk instead of a phantom still in "processing".
      deps.onTerminalPersisted(job);

      if (!job.ticket) {
        deps.onFailed(job, 'NO_TICKET');
        return false;
      }

      // Guard set BEFORE the await: StrictMode and a concurrent poll both stop
      // here, and only one quarantine row is created.
      inFlight.add(jobId);

      try {
        deps.markImagesProcessed?.(jobId);
        const row = await deps.createQuarantine({
          jobId,
          ticket: job.ticket,
          originalResult: job.raw_result,
        });
        deps.onDispatched(job, row.pendiente_id);
        deps.announce?.();
        return true;
      } catch (error) {
        // Released on purpose: the alternative is a ticket the user can never
        // review because their first attempt failed.
        inFlight.delete(jobId);
        deps.onFailed(job, codeOf(error));
        return false;
      }
    },
  };
}
