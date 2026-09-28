// src/voice/useVoiceJobs.ts
// ============================================
// Voice v1 - Job orchestration store (reducer based)
// ============================================
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry';
import { DEFAULT_VOICE_LANGUAGE, VoiceApiError, createVoiceJob, isAbortError } from './apiClient';
import { validateAudioBlob, validateContextSize } from './contract';
import { useVoiceContext } from './contextBuilder';
import {
  RESUME_WINDOW_MS,
  addStoredVoiceJob,
  clearStaleStoredVoiceJobs,
  loadStoredVoiceJobs,
  removeStoredVoiceJob,
} from './storage';
import type { StoredVoiceJob } from './storage';
import { runVoicePollingLoop, type VoicePollingController } from './useVoicePolling';
import type { VoiceContext, VoiceJobCreate, VoiceJobStage, VoiceJobStatus, VoiceMovement } from './types';

/** Frontend lifecycle of a voice job. */
export type VoiceJobPhase =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'abandoned';

/** Observable state of a single voice job. */
export interface VoiceJobState {
  jobId: string;
  idempotencyKey: string;
  phase: VoiceJobPhase;
  status: VoiceJobStatus | null;
  stage: VoiceJobStage | null;
  result: { movements: VoiceMovement[] } | null;
  /** 'NETWORK', a FastAPI code, or the job error_code. */
  errorCode: string | null;
  /** True when the POST failed and the same idempotency key can be reused. */
  canRetry: boolean;
  createdAt: string;
}

/** Public surface of `useVoiceJobs`. */
export interface UseVoiceJobsResult {
  jobs: Record<string, VoiceJobState>;
  /**
   * Uploads the blob. Resolves to the backend job id once the job was accepted,
   * or `null` when nothing was accepted (local validation failure, transport
   * error, or an aborted upload).
   */
  submit(blob: Blob, signal?: AbortSignal): Promise<string | null>;
  /** Re-uploads the last blob with the same idempotency key. Same result shape as `submit`. */
  retryLastSubmit(): Promise<string | null>;
  resumePending(): { resumed: number; abandoned: number };
  clearJob(jobId: string): void;
  /**
   * Gives up on every job the backend still owns and reports the abandoned ids.
   * Used when the app stayed backgrounded past the resume window: the job is
   * dead for the user even though the backend (and the quarantine) may keep its
   * own copy. Storage entries and pollers are released so nothing is left armed.
   */
  abandonInFlightJobs(): string[];
}

type VoiceJobsState = Record<string, VoiceJobState>;

type VoiceJobsAction =
  | { type: 'upsert'; job: VoiceJobState }
  | { type: 'patch'; jobId: string; patch: Partial<VoiceJobState> }
  | { type: 'remove'; jobId: string };

function voiceJobsReducer(state: VoiceJobsState, action: VoiceJobsAction): VoiceJobsState {
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

/** Phases where the backend still owns the job and a local timeout can fire. */
const IN_FLIGHT_PHASES: readonly VoiceJobPhase[] = ['uploading', 'queued', 'processing'];

function phaseFromStatus(status: VoiceJobStatus): VoiceJobPhase {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
    case 'retry_wait':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'terminal_failed':
      return 'failed';
    default:
      return 'processing';
  }
}

/** Reads the current access token from the shared Supabase session. */
async function readAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Orchestrates voice jobs: upload, polling, local persistence and resume.
 * Intentionally hook-local: Tanda 3 decides where it gets mounted globally.
 */
export function useVoiceJobs(): UseVoiceJobsResult {
  const [jobs, dispatch] = useReducer(voiceJobsReducer, {});
  const { context } = useVoiceContext();

  const contextRef = useRef<VoiceContext | null>(null);
  const lastSubmitRef = useRef<{ blob: Blob; idempotencyKey: string } | null>(null);
  const pollersRef = useRef<Map<string, VoicePollingController>>(new Map());
  const mountedRef = useRef(true);
  // Mirror of the reducer state: `abandonInFlightJobs` reads it synchronously
  // without pulling `jobs` into the identity of every callback.
  const jobsRef = useRef<VoiceJobsState>({});

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    mountedRef.current = true;
    const pollers = pollersRef.current;
    return () => {
      mountedRef.current = false;
      for (const controller of pollers.values()) controller.cancel();
      pollers.clear();
    };
  }, []);

  const dispatchLocalFailure = useCallback(
    (jobId: string, errorCode: string, canRetry: boolean): void => {
      dispatch({
        type: 'upsert',
        job: {
          jobId,
          idempotencyKey: jobId,
          phase: 'failed',
          status: null,
          stage: null,
          result: null,
          errorCode,
          canRetry,
          createdAt: new Date().toISOString(),
        },
      });
    },
    []
  );

  const startPolling = useCallback(
    (jobId: string, accessToken: string, createdAt?: string): void => {
      pollersRef.current.get(jobId)?.cancel();
      telemetry.track('voice_polling_started', { job_id: jobId }, TELEMETRY_PRIORITY.LOW);

      const controller = runVoicePollingLoop({
        jobId,
        accessToken,
        createdAt,
        onUpdate: (job) => {
          if (!mountedRef.current) return;
          dispatch({
            type: 'patch',
            jobId,
            patch: {
              phase: phaseFromStatus(job.status),
              status: job.status,
              stage: job.stage,
              errorCode: null,
            },
          });
        },
        onCompleted: (result) => {
          pollersRef.current.delete(jobId);
          removeStoredVoiceJob(jobId);
          const movements = result?.movements ?? [];
          // The two outcomes are distinct products events: movements waiting in
          // the quarantine vs. nothing to review at all.
          if (movements.length > 0) {
            telemetry.track('voice_completed', { count: movements.length }, TELEMETRY_PRIORITY.MEDIUM);
            // Quarantine views (CuarentenaPage, BandejaCuarentena) reload when
            // rows land: they load once on mount and only refresh on their own
            // actions, so an external landing would stay invisible.
            window.dispatchEvent(new CustomEvent('voice-quarantine-landed'));
          } else {
            telemetry.track('voice_empty_result', {}, TELEMETRY_PRIORITY.MEDIUM);
          }
          if (!mountedRef.current) return;
          dispatch({
            type: 'patch',
            jobId,
            patch: {
              phase: 'completed',
              status: 'completed',
              stage: 'done',
              result,
              errorCode: null,
              canRetry: false,
            },
          });
        },
        onFailed: ({ code }) => {
          // Covers the local deadline (`TIMEOUT`) and every backend failure: the
          // poller is released and the job is no longer resumable.
          pollersRef.current.get(jobId)?.cancel();
          pollersRef.current.delete(jobId);
          removeStoredVoiceJob(jobId);
          if (!mountedRef.current) return;
          dispatch({
            type: 'patch',
            jobId,
            patch: {
              phase: 'failed',
              status: 'terminal_failed',
              stage: null,
              errorCode: code,
              canRetry: false,
            },
          });
        },
      });

      pollersRef.current.set(jobId, controller);
    },
    []
  );

  const runUpload = useCallback(
    async (blob: Blob, idempotencyKey: string, signal?: AbortSignal): Promise<string | null> => {
      const currentContext = contextRef.current;
      if (!currentContext) {
        dispatchLocalFailure(idempotencyKey, 'CONTEXT_UNAVAILABLE', false);
        return null;
      }
      if (!validateContextSize(currentContext)) {
        dispatchLocalFailure(idempotencyKey, 'CONTEXT_TOO_LARGE', false);
        return null;
      }

      const accessToken = await readAccessToken();
      if (!mountedRef.current) return null;
      if (!accessToken) {
        dispatchLocalFailure(idempotencyKey, 'UNAUTHORIZED', false);
        return null;
      }

      // Kept so `retryLastSubmit` can reuse the exact blob and key.
      lastSubmitRef.current = { blob, idempotencyKey };

      const createdAt = new Date().toISOString();
      dispatch({
        type: 'upsert',
        job: {
          jobId: idempotencyKey,
          idempotencyKey,
          phase: 'uploading',
          status: null,
          stage: null,
          result: null,
          errorCode: null,
          canRetry: false,
          createdAt,
        },
      });

      let created: VoiceJobCreate;
      try {
        created = await createVoiceJob({
          audioBlob: blob,
          idempotencyKey,
          language: DEFAULT_VOICE_LANGUAGE,
          context: currentContext,
          accessToken,
          signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          // The user closed the modal mid-upload: drop the local job silently.
          dispatch({ type: 'remove', jobId: idempotencyKey });
          return null;
        }
        // The key is intentionally kept so a retry stays idempotent.
        const code = error instanceof VoiceApiError ? error.code : 'UNKNOWN';
        telemetry.track('voice_send_failed', { error_code: code }, TELEMETRY_PRIORITY.LOW);
        dispatch({
          type: 'patch',
          jobId: idempotencyKey,
          patch: { phase: 'failed', errorCode: code, canRetry: true },
        });
        return null;
      }

      if (!mountedRef.current) return null;

      addStoredVoiceJob({
        job_id: created.job_id,
        created_at: createdAt,
        idempotency_key: idempotencyKey,
      });

      telemetry.track('voice_sent', { job_id: created.job_id }, TELEMETRY_PRIORITY.MEDIUM);

      dispatch({ type: 'remove', jobId: idempotencyKey });
      dispatch({
        type: 'upsert',
        job: {
          jobId: created.job_id,
          idempotencyKey,
          phase: 'queued',
          status: 'queued',
          stage: 'queued',
          result: null,
          errorCode: null,
          canRetry: false,
          createdAt,
        },
      });

      startPolling(created.job_id, accessToken, createdAt);
      return created.job_id;
    },
    [dispatchLocalFailure, startPolling]
  );

  const submit = useCallback(
    async (blob: Blob, signal?: AbortSignal): Promise<string | null> => {
      // A fresh key per submit: each send is an independent job, never a reuse
      // of the previous one (only `retryLastSubmit` reuses its own key).
      const idempotencyKey = crypto.randomUUID();

      const audioCheck = validateAudioBlob(blob);
      if (!audioCheck.ok) {
        const reason = audioCheck.reason === 'too_big' ? 'AUDIO_TOO_BIG' : 'EMPTY';
        dispatchLocalFailure(idempotencyKey, reason, false);
        return null;
      }

      return runUpload(blob, idempotencyKey, signal);
    },
    [dispatchLocalFailure, runUpload]
  );

  const retryLastSubmit = useCallback(async (): Promise<string | null> => {
    const pending = lastSubmitRef.current;
    if (!pending) return null;
    return runUpload(pending.blob, pending.idempotencyKey);
  }, [runUpload]);

  const resumePolling = useCallback(
    async (storedJobs: StoredVoiceJob[]): Promise<void> => {
      const accessToken = await readAccessToken();
      if (!mountedRef.current) return;
      if (!accessToken) {
        // No session means there is nothing to poll: surface it instead of
        // leaving the jobs stuck in `processing` forever.
        for (const storedJob of storedJobs) {
          removeStoredVoiceJob(storedJob.job_id);
          dispatch({
            type: 'patch',
            jobId: storedJob.job_id,
            patch: { phase: 'failed', errorCode: 'UNAUTHORIZED', canRetry: false },
          });
        }
        return;
      }
      for (const storedJob of storedJobs) {
        // The stored `created_at` anchors the deadline across resumes.
        startPolling(storedJob.job_id, accessToken, storedJob.created_at);
      }
    },
    [startPolling]
  );

  /**
   * Resumes jobs still inside the resume window and reports how many were
   * queued for polling (`resumed`) and dropped as stale (`abandoned`).
   * Polling itself starts once the session token is resolved.
   */
  const resumePending = useCallback((): { resumed: number; abandoned: number } => {
    const abandoned = clearStaleStoredVoiceJobs(RESUME_WINDOW_MS);
    const stored = loadStoredVoiceJobs();
    if (stored.length === 0) return { resumed: 0, abandoned };

    for (const storedJob of stored) {
      dispatch({
        type: 'upsert',
        job: {
          jobId: storedJob.job_id,
          idempotencyKey: storedJob.idempotency_key,
          phase: 'processing',
          status: null,
          stage: null,
          result: null,
          errorCode: null,
          canRetry: false,
          createdAt: storedJob.created_at,
        },
      });
    }

    // Polling startup needs the session token, which is resolved asynchronously.
    void resumePolling(stored);

    return { resumed: stored.length, abandoned };
  }, [resumePolling]);

  const clearJob = useCallback((jobId: string): void => {
    pollersRef.current.get(jobId)?.cancel();
    pollersRef.current.delete(jobId);
    removeStoredVoiceJob(jobId);
    dispatch({ type: 'remove', jobId });
  }, []);

  /**
   * Marks every in-flight job as `abandoned` after the background window
   * expired. The job is kept in the reducer so the UI can report the timeout,
   * but the poller is cancelled and the storage entry removed, so returning to
   * the app never restarts a job the user already lost.
   */
  const abandonInFlightJobs = useCallback((): string[] => {
    const abandoned: string[] = [];
    for (const job of Object.values(jobsRef.current)) {
      if (!IN_FLIGHT_PHASES.includes(job.phase)) continue;
      pollersRef.current.get(job.jobId)?.cancel();
      pollersRef.current.delete(job.jobId);
      removeStoredVoiceJob(job.jobId);
      dispatch({
        type: 'patch',
        jobId: job.jobId,
        patch: {
          phase: 'abandoned',
          status: 'terminal_failed',
          stage: null,
          errorCode: 'TIMEOUT',
          canRetry: false,
        },
      });
      abandoned.push(job.jobId);
    }
    return abandoned;
  }, []);

  return { jobs, submit, retryLastSubmit, resumePending, clearJob, abandonInFlightJobs };
}
