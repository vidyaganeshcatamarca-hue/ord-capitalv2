// src/ocr/polling.ts
// ============================================
// OCR v1 - Job polling loop with backoff (no hard deadline)
// ============================================
//
// Normative source: definitive PRD §38 and contract v1 §8.
//
// Deliberate differences from the Voice loop:
//   - NO processing deadline. Voice assumes seconds; OCR may legitimately wait
//     days for inference (§36, `waiting_for_inference`), so copying Voice's
//     10-minute/3-minute windows would strand a received ticket. The ticket is
//     never "expired" by time — only by a terminal backend status.
//   - POLLING PAUSES while the app is hidden and fires immediately when it
//     becomes visible again (§38).
//   - Unknown statuses keep polling instead of being read as failures.

import { OcrApiError, getOcrJob } from './apiClient';
import type { OcrJob } from './types';
import { isOcrDispatchStatus, isOcrTerminalStatus } from './types';

/**
 * Backoff between polls: frequent right after upload, then progressively
 * spaced. The last value is the steady-state interval.
 */
export const OCR_POLL_DELAYS_MS = [2000, 4000, 8000, 15000, 30000, 60000, 120000, 300000] as const;

/** Steady-state polling interval (5 minutes). */
export const OCR_POLL_INTERVAL_MAX_MS = 300000;

/** Consecutive tolerated failures before the loop gives up. */
export const OCR_MAX_CONSECUTIVE_FAILURES = 5;

/** HTTP statuses treated as transient: retried with the same backoff. */
const RETRYABLE_HTTP_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504];

/** Handle used to stop a running polling loop. */
export interface OcrPollingController {
  cancel(): void;
}

export interface RunOcrPollingLoopInput {
  jobId: string;
  accessToken: string;
  /** Called on every non-terminal poll (no telemetry is emitted per poll). */
  onUpdate?: (job: OcrJob) => void;
  /** Terminal status with a result to dispatch into the quarantine. */
  onResult: (job: OcrJob) => void;
  /** Terminal status without a result (`failed`, `cancelled`) or a dead loop. */
  onStopped: (info: { code: string; terminal: boolean }) => void;
  signal?: AbortSignal;
  /** Injectable for tests; defaults to the real timer/document. */
  now?: () => number;
  /**
   * Injectable for tests; defaults to the real transport.
   *
   * The loop's only network call is this GET, so tests need to control it to
   * prove what happens across a visibility cycle without a live backend. Same
   * pattern as `now`: a seam, not a second implementation.
   */
  fetchJob?: (input: { jobId: string; accessToken: string; signal?: AbortSignal }) => Promise<OcrJob>;
}

function isRetryable(error: OcrApiError): boolean {
  if (error.code === 'NETWORK') return true;
  return error.httpStatus !== null && RETRYABLE_HTTP_STATUSES.includes(error.httpStatus);
}

/** Delay for the n-th attempt, capped at the steady-state interval. */
export function ocrPollDelayFor(attempt: number): number {
  if (attempt < 0) return OCR_POLL_DELAYS_MS[0];
  if (attempt >= OCR_POLL_DELAYS_MS.length) return OCR_POLL_INTERVAL_MAX_MS;
  return OCR_POLL_DELAYS_MS[attempt];
}

function isDocumentHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

/**
 * Imperative polling loop (no React dependency). Terminates exactly once,
 * either through `onResult` or `onStopped`.
 */
export function runOcrPollingLoop(input: RunOcrPollingLoopInput): OcrPollingController {
  const { jobId, accessToken, onUpdate, onResult, onStopped, signal } = input;
  const fetchJob = input.fetchJob ?? getOcrJob;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let consecutiveFailures = 0;
  let paused = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const detachDocument = (): void => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const cancel = (): void => {
    cancelled = true;
    clearTimer();
    detachDocument();
    signal?.removeEventListener('abort', cancel);
  };

  const stop = (code: string, terminal: boolean): void => {
    cancel();
    onStopped({ code, terminal });
  };

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    // Hidden app: no network. `onVisibilityChange` resumes with an immediate GET.
    if (paused || isDocumentHidden()) {
      paused = true;
      return;
    }

    let job: OcrJob;
    try {
      job = await fetchJob({ jobId, accessToken, signal });
    } catch (error) {
      if (cancelled) return;
      if (error instanceof Error && error.name === 'AbortError') {
        cancel();
        return;
      }
      if (!(error instanceof OcrApiError)) {
        // Unknown transport failure: count it and retry, never discard the job.
        consecutiveFailures += 1;
        if (consecutiveFailures > OCR_MAX_CONSECUTIVE_FAILURES) {
          stop('NETWORK', false);
          return;
        }
        scheduleNext();
        return;
      }
      // Broken auth is never retried: the user has to sign in again.
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        stop(error.code, false);
        return;
      }
      // A 404 means the backend does not know the job: retrying cannot help.
      if (error.httpStatus === 404) {
        stop('NOT_FOUND', true);
        return;
      }
      if (!isRetryable(error)) {
        stop(error.code, false);
        return;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures > OCR_MAX_CONSECUTIVE_FAILURES) {
        stop(error.code, false);
        return;
      }
      scheduleNext();
      return;
    }

    if (cancelled) return;
    consecutiveFailures = 0;

    if (isOcrDispatchStatus(job.status)) {
      cancel();
      onResult(job);
      return;
    }

    if (isOcrTerminalStatus(job.status)) {
      // `failed` / `cancelled`: terminal, no automatic re-upload (PRD §36).
      stop(job.error_code ?? job.status.toUpperCase(), true);
      return;
    }

    onUpdate?.(job);
    scheduleNext();
  };

  const scheduleNext = (): void => {
    if (cancelled || paused) return;
    const delay = ocrPollDelayFor(attempt);
    attempt += 1;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, delay);
  };

  function onVisibilityChange(): void {
    if (cancelled) return;
    if (isDocumentHidden()) {
      paused = true;
      clearTimer();
      return;
    }
    if (!paused) return;
    paused = false;
    // Back to the foreground: ask right away instead of waiting the backoff.
    attempt = 0;
    clearTimer();
    void tick();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  if (signal?.aborted) {
    cancelled = true;
  } else {
    signal?.addEventListener('abort', cancel);
    scheduleNext();
  }

  return { cancel };
}
