// src/ocr/useOcrJobs.ts
// ============================================
// OCR v1 - Job orchestration: upload, resume, polling, quarantine dispatch
// ============================================
//
// Normative source: definitive PRD §32-§40, §47, §52, §75-§77, §91-§92, §107.
//
// This hook IS the bridge. It stays mounted for the whole session (the capture
// modal is just a view), so a ticket keeps moving while the user does something
// else and a `completed` job lands in the quarantine without the modal open.
//
// Robustness contracts honoured here:
//   - the dispatch guard is a ref, set BEFORE the first await, so StrictMode
//     double-invocation and repeated effects cannot create a second quarantine;
//   - the job is dropped only when it is terminal AND dispatched (§40);
//   - a missing local image never blocks upload/save/confirm (§75);
//   - no telemetry per poll (§69).

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { OcrApiError, createOcrJob, isAbortError, readOcrAccessToken } from './apiClient';
import { validateOcrFiles } from './contract';
import { ocrFileRejectionI18nKey } from './errors';
import { rekeyOcrImages, saveOcrImages, sweepOcrImages, markOcrImagesProcessed } from './imageStore';
import { syncPendingOcrMemory } from './memory';
import { runOcrPollingLoop, type OcrPollingController } from './polling';
import { loadOcrQuarantine } from './quarantine';
import {
  isOcrCacheMaintenanceDue,
  loadOcrJobs,
  patchOcrJob,
  pruneDispatchedOcrJobs,
  removeOcrJob,
  upsertOcrJob,
  writeOcrCacheMaintenanceAt,
} from './storage';
import { OCR_EVENTS, trackOcrError, trackOcrEvent } from './telemetry';
import { isOcrDispatchStatus, type OcrJob, type OcrJobStatus } from './types';
import type { OcrContext } from './contextTypes';

/** Frontend lifecycle of an OCR job. */
export type OcrJobPhase =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'waiting'
  | 'classifying'
  | 'ready'
  | 'dispatched'
  | 'failed'
  | 'cancelled';

export interface OcrJobState {
  jobId: string;
  phase: OcrJobPhase;
  status: OcrJobStatus | null;
  errorCode: string | null;
  duplicate: boolean;
  itemCount: number | null;
  issueCount: number;
  pendienteId: number | null;
  createdAt: string;
}

export interface SubmitOcrTicketInput {
  files: readonly File[];
  context: OcrContext;
}

export interface SubmitOcrTicketResult {
  jobId: string | null;
  /** i18n key when the submit was rejected locally or by the transport. */
  errorI18nKey: string | null;
  /** Stable code for telemetry/debugging. */
  errorCode: string | null;
  duplicate: boolean;
}

export interface UseOcrJobsResult {
  jobs: Record<string, OcrJobState>;
  submit(input: SubmitOcrTicketInput): Promise<SubmitOcrTicketResult>;
  /** Retries the quarantine dispatch of a job whose RPC failed. */
  retryDispatch(jobId: string): Promise<boolean>;
  /** Drops a finished job from the followed set (UI housekeeping only). */
  clearJob(jobId: string): void;
  /** Syncs queued category corrections (also retried on focus). */
  syncMemory(jobId?: string): Promise<void>;
}

type OcrJobsState = Record<string, OcrJobState>;

type Action =
  | { type: 'upsert'; job: OcrJobState }
  | { type: 'patch'; jobId: string; patch: Partial<OcrJobState> }
  | { type: 'remove'; jobId: string };

function reducer(state: OcrJobsState, action: Action): OcrJobsState {
  switch (action.type) {
    case 'upsert':
      return { ...state, [action.job.jobId]: action.job };
    case 'patch': {
      const existing = state[action.jobId];
      if (!existing) return state;
      return { ...state, [action.jobId]: { ...existing, ...action.patch } };
    }
    case 'remove': {
      if (!(action.jobId in state)) return state;
      const next = { ...state };
      delete next[action.jobId];
      return next;
    }
    default:
      return state;
  }
}

function phaseFromStatus(status: OcrJobStatus): OcrJobPhase {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'waiting_for_inference':
      return 'waiting';
    case 'classifying':
      return 'classifying';
    case 'completed':
    case 'needs_review':
      return 'ready';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'processing':
    default:
      return 'processing';
  }
}

/** Local id used to store images before the backend assigns a `job_id`. */
function newLocalUploadId(): string {
  try {
    return `upload-${crypto.randomUUID()}`;
  } catch {
    return `upload-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
}

export function useOcrJobs(): UseOcrJobsResult {
  const [jobs, dispatch] = useReducer(reducer, {});

  const pollersRef = useRef<Map<string, OcrPollingController>>(new Map());
  const dispatchedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const jobsRef = useRef<OcrJobsState>({});

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const patch = useCallback((jobId: string, next: Partial<OcrJobState>): void => {
    if (!mountedRef.current) return;
    dispatch({ type: 'patch', jobId, patch: next });
  }, []);

  /**
   * Hands a finished job to the quarantine exactly once. The guard is marked
   * BEFORE the await so a StrictMode re-run is a no-op (PRD §77).
   */
  const dispatchToQuarantine = useCallback(async (job: OcrJob): Promise<boolean> => {
    if (!job.ticket) return false;
    const jobId = job.job_id;
    if (dispatchedRef.current.has(jobId)) return true;
    dispatchedRef.current.add(jobId);

    // The 7-day image window starts when processing finished (§44).
    void markOcrImagesProcessed(jobId);

    try {
      const row = await loadOcrQuarantine({
        jobId,
        ticket: job.ticket,
        originalResult: job.raw_result,
      });
      upsertOcrJob({
        job_id: jobId,
        created_at: job.created_at || new Date().toISOString(),
        last_status: job.status,
        last_checked_at: new Date().toISOString(),
        quarantine_dispatched: true,
        pendiente_id: row.pendiente_id,
      });
      patch(jobId, {
        phase: 'dispatched',
        status: job.status,
        itemCount: job.ticket.items.length,
        issueCount: job.ticket.issues.length,
        pendienteId: row.pendiente_id,
        errorCode: null,
      });
      // Announce the landing so the tray refreshes from any screen.
      try {
        window.dispatchEvent(new CustomEvent('ocr-quarantine-landed'));
      } catch {
        // No DOM (tests): nothing to announce.
      }
      return true;
    } catch (error) {
      // The guard is released so a later retry can still land the ticket: the
      // alternative is a job the user can never review.
      dispatchedRef.current.delete(jobId);
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? 'DISPATCH_FAILED')
          : 'DISPATCH_FAILED';
      trackOcrError('quarantine_dispatch', code, { job_id: jobId, status: job.status });
      patchOcrJob(jobId, { last_status: job.status, quarantine_dispatched: false });
      patch(jobId, { errorCode: 'DISPATCH_FAILED' });
      return false;
    }
  }, [patch]);

  const startPolling = useCallback(
    (jobId: string, accessToken: string): void => {
      pollersRef.current.get(jobId)?.cancel();

      const controller = runOcrPollingLoop({
        jobId,
        accessToken,
        onUpdate: (job) => {
          patchOcrJob(jobId, { last_status: job.status, last_checked_at: new Date().toISOString() });
          patch(jobId, { phase: phaseFromStatus(job.status), status: job.status, errorCode: null });
        },
        onResult: (job) => {
          pollersRef.current.delete(jobId);
          void dispatchToQuarantine(job);
        },
        onStopped: ({ code, terminal }) => {
          pollersRef.current.delete(jobId);
          if (terminal) {
            // `failed`/`cancelled` keep the job id but stop following it: no
            // automatic re-upload (§36).
            patchOcrJob(jobId, { last_status: null, last_checked_at: new Date().toISOString() });
            patch(jobId, {
              phase: code === 'CANCELLED' ? 'cancelled' : 'failed',
              status: code === 'CANCELLED' ? 'cancelled' : 'failed',
              errorCode: code,
            });
          } else {
            trackOcrError('polling', code, { job_id: jobId });
            patch(jobId, { errorCode: code });
          }
        },
      });

      pollersRef.current.set(jobId, controller);
    },
    [dispatchToQuarantine, patch]
  );

  const resumePending = useCallback(async (): Promise<void> => {
    if (jobsRef.current && Object.keys(jobsRef.current).length > 0) return;
    const stored = loadOcrJobs().value;
    if (stored.length === 0) return;

    const accessToken = await readOcrAccessToken();
    if (!mountedRef.current) return;

    for (const job of stored) {
      if (job.quarantine_dispatched && job.pendiente_id !== null) continue;
      dispatch({
        type: 'upsert',
        job: {
          jobId: job.job_id,
          phase: job.last_status ? phaseFromStatus(job.last_status) : 'processing',
          status: job.last_status,
          errorCode: null,
          duplicate: false,
          itemCount: null,
          issueCount: 0,
          pendienteId: job.pendiente_id,
          createdAt: job.created_at,
        },
      });
      if (!accessToken) {
        patch(job.job_id, { errorCode: 'UNAUTHORIZED' });
        continue;
      }
      startPolling(job.job_id, accessToken);
    }
  }, [patch, startPolling]);

  const syncMemory = useCallback(async (jobId?: string): Promise<void> => {
    const accessToken = await readOcrAccessToken();
    if (!accessToken) return;
    await syncPendingOcrMemory({ accessToken, jobId });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const pollers = pollersRef.current;

    void resumePending().catch(() => undefined);
    // The monthly sweep runs once per app open only when it is due: never a full
    // scan on every start (PRD §45).
    if (isOcrCacheMaintenanceDue()) {
      const activeIds = loadOcrJobs().value.map((job) => job.job_id);
      void sweepOcrImages(activeIds)
        .then(() => writeOcrCacheMaintenanceAt(Date.now()))
        .catch(() => undefined);
    }
    void syncMemory();
    pruneDispatchedOcrJobs();

    return () => {
      mountedRef.current = false;
      for (const controller of pollers.values()) controller.cancel();
      pollers.clear();
    };
    // Intentionally once per mount: the bridge owns its own lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry the pending memory sync when the app comes back to the foreground.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void syncMemory();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncMemory]);

  const submit = useCallback(
    async (input: SubmitOcrTicketInput): Promise<SubmitOcrTicketResult> => {
      const { files, context } = input;
      const validation = validateOcrFiles(files);
      if (!validation.ok) {
        trackOcrError('upload', `FILE_${validation.reason.toUpperCase()}`, {
          file_count: files.length,
        });
        return {
          jobId: null,
          errorI18nKey: ocrFileRejectionI18nKey(validation.reason),
          errorCode: `FILE_${validation.reason.toUpperCase()}`,
          duplicate: false,
        };
      }

      const accessToken = await readOcrAccessToken();
      if (!accessToken) {
        trackOcrError('upload', 'UNAUTHORIZED', { file_count: files.length });
        return {
          jobId: null,
          errorI18nKey: 'ocr.error_unauthorized',
          errorCode: 'UNAUTHORIZED',
          duplicate: false,
        };
      }

      const localId = newLocalUploadId();
      // Stored before the POST so the copy exists even if the request dies
      // (§130). Rekeyed to the real job id right after acceptance.
      const stored = await saveOcrImages(localId, files);
      if (!stored.durable) {
        trackOcrError('local_image_store', 'STORAGE_UNAVAILABLE', { file_count: files.length });
      }

      if (mountedRef.current) {
        dispatch({
          type: 'upsert',
          job: {
            jobId: localId,
            phase: 'uploading',
            status: null,
            errorCode: null,
            duplicate: false,
            itemCount: null,
            issueCount: 0,
            pendienteId: null,
            createdAt: new Date().toISOString(),
          },
        });
      }

      trackOcrEvent(OCR_EVENTS.uploadStarted, { file_count: files.length });

      try {
        const accepted = await createOcrJob({ files, context, accessToken });
        if (!mountedRef.current) return { jobId: accepted.job_id, errorI18nKey: null, errorCode: null, duplicate: accepted.duplicate };

        if (stored.saved > 0) void rekeyOcrImages(localId, accepted.job_id);

        dispatch({ type: 'remove', jobId: localId });
        dispatch({
          type: 'upsert',
          job: {
            jobId: accepted.job_id,
            phase: phaseFromStatus(accepted.status),
            status: accepted.status,
            errorCode: null,
            duplicate: accepted.duplicate,
            itemCount: null,
            issueCount: 0,
            pendienteId: null,
            createdAt: new Date().toISOString(),
          },
        });

        upsertOcrJob({
          job_id: accepted.job_id,
          created_at: new Date().toISOString(),
          last_status: accepted.status,
          last_checked_at: new Date().toISOString(),
          quarantine_dispatched: false,
          pendiente_id: null,
        });

        trackOcrEvent(OCR_EVENTS.uploadAccepted, {
          job_id: accepted.job_id,
          status: accepted.status,
          file_count: files.length,
          duplicate: accepted.duplicate,
        });

        startPolling(accepted.job_id, accessToken);

        return {
          jobId: accepted.job_id,
          errorI18nKey: null,
          errorCode: null,
          duplicate: accepted.duplicate,
        };
      } catch (error) {
        dispatch({ type: 'remove', jobId: localId });
        if (isAbortError(error)) {
          return { jobId: null, errorI18nKey: null, errorCode: null, duplicate: false };
        }
        const code = error instanceof OcrApiError ? error.code : 'UNKNOWN';
        const i18nKey = error instanceof OcrApiError ? error.i18nKey : 'ocr.error_upload_failed';
        trackOcrError('upload', code, { file_count: files.length });
        return { jobId: null, errorI18nKey: i18nKey, errorCode: code, duplicate: false };
      }
    },
    [startPolling]
  );

  const retryDispatch = useCallback(
    async (jobId: string): Promise<boolean> => {
      const stored = loadOcrJobs().value.find((job) => job.job_id === jobId);
      if (!stored) return false;
      // Re-polling is what re-delivers the result: the ticket is still owned by
      // the backend, so a single GET is enough and avoids a second upload.
      const accessToken = await readOcrAccessToken();
      if (!accessToken) return false;
      dispatchedRef.current.delete(jobId);
      startPolling(jobId, accessToken);
      return true;
    },
    [startPolling]
  );

  const clearJob = useCallback((jobId: string): void => {
    pollersRef.current.get(jobId)?.cancel();
    pollersRef.current.delete(jobId);
    removeOcrJob(jobId);
    dispatch({ type: 'remove', jobId });
  }, []);

  return { jobs, submit, retryDispatch, clearJob, syncMemory };
}
