// src/voice/useVoicePolling.ts
// ============================================
// Voice v1 - Job polling loop (backoff) + React wrapper
// ============================================
import { useEffect, useRef } from 'react';
import { VoiceApiError, getVoiceJob, isAbortError } from './apiClient';
import type { VoiceJob, VoiceMovement } from './types';

/**
 * Backoff used between polls. Once the list is exhausted the loop keeps
 * polling every POLL_INTERVAL_MAX_MS.
 */
export const POLL_DELAYS_MS = [1000, 3000, 7000, 15000, 30000] as const;

/** Steady-state polling interval. */
export const POLL_INTERVAL_MAX_MS = 30000;

/** Consecutive tolerated failures before the loop gives up. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** HTTP statuses treated as transient: retried with the same backoff. */
const RETRYABLE_HTTP_STATUSES: readonly number[] = [429, 500, 502, 503, 504];

/** Handle used to stop a running polling loop. */
export interface VoicePollingController {
  cancel(): void;
}

/** Input accepted by the imperative polling loop. */
export interface RunVoicePollingLoopInput {
  jobId: string;
  accessToken: string;
  onUpdate?: (job: VoiceJob) => void;
  onCompleted: (result: { movements: VoiceMovement[] }) => void;
  onFailed: (info: { code: string }) => void;
  signal?: AbortSignal;
}

function isRetryable(error: VoiceApiError): boolean {
  if (error.code === 'NETWORK') return true;
  return error.httpStatus !== null && RETRYABLE_HTTP_STATUSES.includes(error.httpStatus);
}

/**
 * Imperative polling loop with a `setTimeout` chain (no React dependency).
 * Terminates exactly once, either through `onCompleted` or `onFailed`.
 */
export function runVoicePollingLoop(input: RunVoicePollingLoopInput): VoicePollingController {
  const { jobId, accessToken, onUpdate, onCompleted, onFailed, signal } = input;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let consecutiveFailures = 0;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancel = (): void => {
    cancelled = true;
    clearTimer();
    signal?.removeEventListener('abort', cancel);
  };

  const fail = (code: string): void => {
    cancel();
    onFailed({ code });
  };

  const delayFor = (index: number): number => {
    if (index >= POLL_DELAYS_MS.length) return POLL_INTERVAL_MAX_MS;
    return POLL_DELAYS_MS[index];
  };

  const scheduleNext = (): void => {
    if (cancelled) return;
    const delay = delayFor(attempt);
    attempt += 1;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, delay);
  };

  const tick = async (): Promise<void> => {
    if (cancelled) return;

    let job: VoiceJob;
    try {
      job = await getVoiceJob({ jobId, accessToken, signal });
    } catch (error) {
      if (cancelled) return;
      if (isAbortError(error)) {
        cancel();
        return;
      }
      if (!(error instanceof VoiceApiError)) {
        fail('NETWORK');
        return;
      }
      // Broken auth is never retried: the user has to sign in again.
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        fail(error.code);
        return;
      }
      if (!isRetryable(error)) {
        fail(error.code);
        return;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
        fail(error.code);
        return;
      }
      scheduleNext();
      return;
    }

    if (cancelled) return;
    consecutiveFailures = 0;

    if (job.status === 'completed') {
      const result = job.result ?? { movements: [] };
      cancel();
      onCompleted(result);
      return;
    }

    if (job.status === 'terminal_failed') {
      fail(job.error_code ?? 'UNKNOWN');
      return;
    }

    // queued / processing / retry_wait: retry_wait is not an error.
    onUpdate?.(job);
    scheduleNext();
  };

  if (signal?.aborted) {
    cancelled = true;
  } else {
    signal?.addEventListener('abort', cancel);
    scheduleNext();
  }

  return { cancel };
}

/** Input accepted by the React wrapper. */
export interface UseVoicePollingInput {
  jobId: string | null;
  accessToken: string | null;
  enabled?: boolean;
  onUpdate?: (job: VoiceJob) => void;
  onCompleted: (result: { movements: VoiceMovement[] }) => void;
  onFailed: (info: { code: string }) => void;
}

/**
 * Thin React wrapper around `runVoicePollingLoop`.
 * The loop is cancelled on unmount and whenever `jobId` / `accessToken` / `enabled` change.
 */
export function useVoicePolling(input: UseVoicePollingInput): void {
  const { jobId, accessToken, enabled = true, onUpdate, onCompleted, onFailed } = input;

  const onUpdateRef = useRef(onUpdate);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onCompletedRef.current = onCompleted;
    onFailedRef.current = onFailed;
  }, [onUpdate, onCompleted, onFailed]);

  useEffect(() => {
    if (!enabled || !jobId || !accessToken) return;

    const controller = runVoicePollingLoop({
      jobId,
      accessToken,
      onUpdate: (job) => onUpdateRef.current?.(job),
      onCompleted: (result) => onCompletedRef.current(result),
      onFailed: (info) => onFailedRef.current(info),
    });

    return () => controller.cancel();
  }, [enabled, jobId, accessToken]);
}
