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
import { OcrApiError, createOcrJob, describeOcrNetworkFailure, isAbortError, readOcrAccessToken } from './apiClient';
import { validateOcrFiles } from './contract';
import { ocrFileRejectionI18nKey } from './errors';
import { rekeyOcrImages, saveOcrImages, sweepOcrImages, markOcrImagesProcessed } from './imageStore';
import { syncPendingOcrMemory } from './memory';
import { patchOcrHistory, recordOcrHistory, type OcrHistoryStatus } from './history';
import { createOcrDispatcher, type OcrDispatcher } from './dispatch';
import { isStaleSessionCallback } from './sessionGuard';
import { runOcrPollingLoop, type OcrPollingController } from './polling';
import { loadOcrQuarantine } from './quarantine';
import {
  adoptOcrJobOwner,
  clearOcrJobError,
  isOcrCacheMaintenanceDue,
  isOcrSessionErrorCode,
  loadOcrJobs,
  patchOcrJob,
  recordOcrJobError,
  pruneDispatchedOcrJobs,
  selectResumableOcrJobs,
  removeOcrJob,
  upsertOcrJob,
  writeOcrCacheMaintenanceAt,
} from './storage';
import { OCR_EVENTS, trackOcrError, trackOcrEvent } from './telemetry';
import { isOcrDispatchStatus, type OcrJob, type OcrJobStatus } from './types';
import type { OcrContext } from './contextTypes';
import { useAuth } from '@/contexts/AuthContext';

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
  /** Backend phase inside `processing`, when one was reported. */
  stage: string | null;
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
  | { type: 'remove'; jobId: string }
  | { type: 'clear' };

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
    case 'clear':
      // Only the followed view is dropped: the persisted rows stay, because
      // signing back in as the same user must resume them.
      return {};
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
  const { user } = useAuth();

  const pollersRef = useRef<Map<string, OcrPollingController>>(new Map());
  const mountedRef = useRef(true);
  const jobsRef = useRef<OcrJobsState>({});
  // Owner of the jobs this bridge is allowed to follow. A ref as well as state:
  // the polling callbacks are created once and must read the CURRENT owner.
  const ownerRef = useRef<string | null>(user?.id ?? null);
  ownerRef.current = user?.id ?? null;

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
  /**
   * One dispatcher per mounted bridge. It owns the per-`job_id` guard, so the
   * concurrency contract lives in `dispatch.ts` and can be tested on its own.
   */
  const dispatcherRef = useRef<OcrDispatcher | null>(null);
  if (dispatcherRef.current === null) {
    dispatcherRef.current = createOcrDispatcher({
      createQuarantine: ({ jobId, ticket, originalResult }) =>
        loadOcrQuarantine({ jobId, ticket, originalResult }),
      onTerminalPersisted: (job) => {
        patchOcrJob(job.job_id, {
          last_status: job.status,
          last_checked_at: new Date().toISOString(),
        });
      },
      onDispatched: (job, pendienteId) => {
        const jobId = job.job_id;
        patchOcrJob(jobId, {
          last_status: job.status,
          last_checked_at: new Date().toISOString(),
          quarantine_dispatched: true,
          pendiente_id: pendienteId,
          last_error_code: null,
          server_created_at: job.created_at || null,
          quarantine_dispatched_at: new Date().toISOString(),
        });
        patchOcrHistory(jobId, { status: 'quarantine', pendiente_id: pendienteId });
        patch(jobId, {
          phase: 'dispatched',
          status: job.status,
          itemCount: job.ticket?.items.length ?? 0,
          issueCount: job.ticket?.issues.length ?? 0,
          pendienteId,
          errorCode: null,
        });
      },
      onFailed: (job, code) => {
        trackOcrError('quarantine_dispatch', code, { job_id: job.job_id, status: job.status });
        patchOcrJob(job.job_id, { last_status: job.status, quarantine_dispatched: false });
        recordOcrJobError(job.job_id, code);
        patch(
          job.job_id,
          code === 'NO_TICKET' ? { phase: 'failed', errorCode: code } : { errorCode: code }
        );
      },
      markImagesProcessed: (jobId) => {
        void markOcrImagesProcessed(jobId);
      },
      announce: () => {
        try {
          window.dispatchEvent(new CustomEvent('ocr-quarantine-landed'));
        } catch {
          // No DOM (tests): nothing to announce.
        }
      },
    });
  }

  const dispatchToQuarantine = useCallback(
    (job: OcrJob): Promise<boolean> => dispatcherRef.current!.dispatch(job),
    [patch]
  );

  const startPolling = useCallback(
    (jobId: string, accessToken: string): void => {
      pollersRef.current.get(jobId)?.cancel();

      // The session this poll belongs to, captured once. A response that arrives
      // after the account changed is stale: applying it would touch another
      // user's view and could even dispatch their quarantine.
      const sessionOwner = ownerRef.current;

      const controller = runOcrPollingLoop({
        jobId,
        accessToken,
        onUpdate: (job) => {
          if (isStaleSessionCallback(sessionOwner, ownerRef.current)) return;
          // A 200 is the backend confirming this ticket belongs to the current
          // user: only then does a legacy row get its owner.
          const currentOwner = ownerRef.current;
          if (currentOwner) adoptOcrJobOwner(jobId, currentOwner);
          const now = new Date().toISOString();
          patchOcrJob(jobId, {
            last_status: job.status,
            // Traceability only: an absent stage stays absent, never invented.
            last_stage: job.stage,
            last_checked_at: now,
            // The proof the backend is still answering for this job.
            last_successful_poll_at: now,
            // The backend's own receipt stamp, used later to report latency.
            server_created_at: job.created_at || null,
          });
          // A successful GET proves the polling failure is gone.
          clearOcrJobError(jobId);
          patch(jobId, {
            phase: phaseFromStatus(job.status),
            status: job.status,
            stage: job.stage,
            errorCode: null,
          });
          // The owner's own view of what happened: a job the backend finished
          // classifying is no longer "processing", even before it lands in
          // quarantine (which can take minutes with several photos). The real
          // status travels too, so the row can say what is happening instead of
          // a flat "Procesando".
          const historyStatus: OcrHistoryStatus = isOcrDispatchStatus(job.status)
            ? 'classified'
            : 'processing';
          patchOcrHistory(jobId, {
            status: historyStatus,
            last_status: job.status,
            last_stage: job.stage,
          });
        },
        onResult: (job) => {
          pollersRef.current.delete(jobId);
          // Same guard: a finished ticket from a previous session never lands
          // in the quarantine of the account that is signed in now.
          if (isStaleSessionCallback(sessionOwner, ownerRef.current)) return;
          void dispatchToQuarantine(job);
        },
        onStopped: ({ code, terminal }) => {
          pollersRef.current.delete(jobId);
          recordOcrJobError(jobId, code);
          if (terminal) {
            // A 404 here is the backend refusing THIS session, not a verdict on
            // the job: the real owner signing back in must still be able to
            // resume it. Persisting `failed` would drop it from the circuit for
            // good, which is exactly what the incident logs showed.
            if (isOcrSessionErrorCode(code)) {
              patchOcrJob(jobId, { last_checked_at: new Date().toISOString() });
              patch(jobId, { phase: 'failed', status: null, errorCode: code });
              return;
            }
            // `failed`/`cancelled` are terminal: the job keeps its id but stops
            // being followed, and the stored status is terminal too, so a
            // reload cannot resurrect it as "processing" (§S6).
            const terminalStatus: OcrJobStatus = code === 'CANCELLED' ? 'cancelled' : 'failed';
            patchOcrJob(jobId, {
              last_status: terminalStatus,
              last_checked_at: new Date().toISOString(),
            });
            patchOcrHistory(jobId, { status: 'rejected' });
            patch(jobId, {
              phase: code === 'CANCELLED' ? 'cancelled' : 'failed',
              status: terminalStatus,
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

  /**
   * Mirrors a memory-sync outcome into the persisted job: a confirmed job clears
   * the code, any failure records it. Applied per job so one job's failure never
   * paints another.
   */
  const applyMemorySyncResult = useCallback(
    (result: {
      syncedJobIds: string[];
      failures: { job_id: string; code: string }[];
    }): void => {
      for (const syncedJobId of result.syncedJobIds) clearOcrJobError(syncedJobId);
      for (const failure of result.failures) {
        recordOcrJobError(failure.job_id, failure.code);
      }
    },
    []
  );

  const resumePending = useCallback(async (): Promise<void> => {
    // One token read per mount, shared by the memory sync and the job resume:
    // reading it separately inside the sync raced the Supabase session
    // hydration, so a queued correction could survive every reload without
    // ever being retried.
    const accessToken = await readOcrAccessToken();
    if (!mountedRef.current) return;

    if (accessToken) {
      try {
        const syncResult = await syncPendingOcrMemory({ accessToken });
        applyMemorySyncResult(syncResult);
      } catch {
        // A memory failure never blocks resuming the jobs.
      }
    }

    const owner = ownerRef.current;
    // Without a session there is no owner to match against: hydrating now would
    // start polling tickets the backend is right to refuse with a 404.
    if (!owner) return;

    // One selector owns the rule: this owner's rows, plus legacy rows whose
    // owner is still unknown (polled once, adopted only on a 200), minus the
    // jobs that are genuinely finished. A job whose last failure was a session
    // error stays in, so returning as its owner resumes it.
    const stored = selectResumableOcrJobs(loadOcrJobs().value, owner);
    if (stored.length === 0) return;

    for (const job of stored) {
      if (job.quarantine_dispatched && job.pendiente_id !== null) continue;
      dispatch({
        type: 'upsert',
        job: {
          jobId: job.job_id,
          phase: job.last_status ? phaseFromStatus(job.last_status) : 'processing',
          status: job.last_status,
          stage: job.last_stage,
          errorCode: job.last_error_code,
          duplicate: false,
          itemCount: null,
          issueCount: 0,
          pendienteId: job.pendiente_id,
          createdAt: job.created_at,
        },
      });
      if (!accessToken) {
        // Missing auth is a state the user has to see, not a silent "processing".
        patchOcrJob(job.job_id, { last_status: 'failed' });
        patch(job.job_id, { phase: 'failed', errorCode: 'UNAUTHORIZED' });
        continue;
      }
      startPolling(job.job_id, accessToken);
    }
  }, [applyMemorySyncResult, patch, startPolling]);

  const syncMemory = useCallback(
    async (jobId?: string): Promise<void> => {
      const accessToken = await readOcrAccessToken();
      if (!accessToken) return;
      const result = await syncPendingOcrMemory({ accessToken, jobId });
      applyMemorySyncResult(result);
    },
    [applyMemorySyncResult]
  );

  /**
   * Re-polls the jobs whose quarantine dispatch failed. The ticket is still on
   * the backend and still owned by this user, so one GET re-delivers the result
   * without a second upload.
   */
  const retryPendingDispatches = useCallback(async (): Promise<void> => {
    const owner = ownerRef.current;
    if (!owner) return;
    const failed = selectResumableOcrJobs(loadOcrJobs().value, owner).filter(
      (job) =>
        !job.quarantine_dispatched &&
        job.last_error_code !== null &&
        job.last_status !== null &&
        isOcrDispatchStatus(job.last_status)
    );
    if (failed.length === 0) return;
    const accessToken = await readOcrAccessToken();
    if (!accessToken) return;
    for (const job of failed) startPolling(job.job_id, accessToken);
  }, [startPolling]);

  useEffect(() => {
    mountedRef.current = true;
    const pollers = pollersRef.current;

    void resumePending().catch(() => undefined);
    void retryPendingDispatches().catch(() => undefined);
    // The monthly sweep runs once per app open only when it is due: never a full
    // scan on every start (PRD §45).
    if (isOcrCacheMaintenanceDue()) {
      const activeIds = loadOcrJobs().value.map((job) => job.job_id);
      void sweepOcrImages(activeIds)
        .then(() => writeOcrCacheMaintenanceAt(Date.now()))
        .catch(() => undefined);
    }
    pruneDispatchedOcrJobs();

    return () => {
      mountedRef.current = false;
      for (const controller of pollers.values()) controller.cancel();
      pollers.clear();
    };
    // Intentionally once per mount: the bridge owns its own lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry the pending memory sync and any dead dispatch when the app comes back
  // to the foreground. A failed RPC used to wait for a manual tap that the user
  // never knew about.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      void syncMemory();
      void retryPendingDispatches().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncMemory, retryPendingDispatches]);

  /**
   * A different account can never read these jobs: the backend answers
   * `job_id + user_id`, so polling them is a guaranteed 404. The pollers stop and
   * the followed view is cleared, but the persisted rows stay, so signing back in
   * as the original user resumes them.
   */
  useEffect(() => {
    const ownerId = user?.id ?? null;
    for (const controller of pollersRef.current.values()) controller.cancel();
    pollersRef.current.clear();
    dispatcherRef.current?.reset();
    dispatch({ type: 'clear' });
    if (ownerId) void resumePending().catch(() => undefined);
    // `resumePending` is recreated when `startPolling` changes; keying on the
    // owner alone keeps this effect from re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
            stage: null,
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

      // Elapsed is measured from the attempt, not from the click: it tells a
      // request blocked before it left the browser (a few milliseconds) from
      // one that waited on the server.
      const uploadStartedAt = Date.now();

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
            stage: null,
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
          owner_user_id: ownerRef.current,
          created_at: new Date().toISOString(),
          last_status: accepted.status,
          last_stage: null,
          last_checked_at: new Date().toISOString(),
          last_successful_poll_at: null,
          last_error_at: null,
          quarantine_dispatched: false,
          pendiente_id: null,
          // A fresh job starts clean; the code is set only when a stage fails.
          last_error_code: null,
          // Filled by the first polling GET (server stamp) and by the dispatch.
          server_created_at: null,
          quarantine_dispatched_at: null,
        });

        // The local history outlives the job: the job is pruned once dispatched
        // and removed on confirm/reject, but the owner still wants to see it.
        recordOcrHistory({
          job_id: accepted.job_id,
          created_at: new Date().toISOString(),
          image_count: files.length,
          status: 'processing',
          updated_at: new Date().toISOString(),
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
        trackOcrError('upload', code, {
          file_count: files.length,
          ...describeOcrNetworkFailure(error, Date.now() - uploadStartedAt),
        });
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
      dispatcherRef.current?.release(jobId);
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
