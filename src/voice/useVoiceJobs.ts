// src/voice/useVoiceJobs.ts
// ============================================
// Voice v1 - Job orchestration store (reducer based)
// ============================================
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase } from '../lib/supabase';
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
  submit(blob: Blob): Promise<void>;
  retryLastSubmit(): Promise<void>;
  resumePending(): { resumed: number; abandoned: number };
  clearJob(jobId: string): void;
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

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

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

  const startPolling = useCallback((jobId: string, accessToken: string): void => {
    pollersRef.current.get(jobId)?.cancel();

    const controller = runVoicePollingLoop({
      jobId,
      accessToken,
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
  }, []);

  const runUpload = useCallback(
    async (blob: Blob, idempotencyKey: string): Promise<void> => {
      const currentContext = contextRef.current;
      if (!currentContext) {
        dispatchLocalFailure(idempotencyKey, 'CONTEXT_UNAVAILABLE', false);
        return;
      }
      if (!validateContextSize(currentContext)) {
        dispatchLocalFailure(idempotencyKey, 'CONTEXT_TOO_LARGE', false);
        return;
      }

      const accessToken = await readAccessToken();
      if (!mountedRef.current) return;
      if (!accessToken) {
        dispatchLocalFailure(idempotencyKey, 'UNAUTHORIZED', false);
        return;
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
        });
      } catch (error) {
        if (isAbortError(error)) {
          dispatch({ type: 'remove', jobId: idempotencyKey });
          return;
        }
        // The key is intentionally kept so a retry stays idempotent.
        const code = error instanceof VoiceApiError ? error.code : 'UNKNOWN';
        dispatch({
          type: 'patch',
          jobId: idempotencyKey,
          patch: { phase: 'failed', errorCode: code, canRetry: true },
        });
        return;
      }

      if (!mountedRef.current) return;

      addStoredVoiceJob({
        job_id: created.job_id,
        created_at: createdAt,
        idempotency_key: idempotencyKey,
      });

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

      startPolling(created.job_id, accessToken);
    },
    [dispatchLocalFailure, startPolling]
  );

  const submit = useCallback(
    async (blob: Blob): Promise<void> => {
      const idempotencyKey = crypto.randomUUID();

      const audioCheck = validateAudioBlob(blob);
      if (!audioCheck.ok) {
        const reason = audioCheck.reason === 'too_big' ? 'AUDIO_TOO_BIG' : 'EMPTY';
        dispatchLocalFailure(idempotencyKey, reason, false);
        return;
      }

      await runUpload(blob, idempotencyKey);
    },
    [dispatchLocalFailure, runUpload]
  );

  const retryLastSubmit = useCallback(async (): Promise<void> => {
    const pending = lastSubmitRef.current;
    if (!pending) return;
    await runUpload(pending.blob, pending.idempotencyKey);
  }, [runUpload]);

  const resumePolling = useCallback(
    async (jobIds: string[]): Promise<void> => {
      const accessToken = await readAccessToken();
      if (!mountedRef.current) return;
      if (!accessToken) {
        // No session means there is nothing to poll: surface it instead of
        // leaving the jobs stuck in `processing` forever.
        for (const jobId of jobIds) {
          removeStoredVoiceJob(jobId);
          dispatch({
            type: 'patch',
            jobId,
            patch: { phase: 'failed', errorCode: 'UNAUTHORIZED', canRetry: false },
          });
        }
        return;
      }
      for (const jobId of jobIds) {
        startPolling(jobId, accessToken);
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
    void resumePolling(stored.map((storedJob) => storedJob.job_id));

    return { resumed: stored.length, abandoned };
  }, [resumePolling]);

  const clearJob = useCallback((jobId: string): void => {
    pollersRef.current.get(jobId)?.cancel();
    pollersRef.current.delete(jobId);
    removeStoredVoiceJob(jobId);
    dispatch({ type: 'remove', jobId });
  }, []);

  return { jobs, submit, retryLastSubmit, resumePending, clearJob };
}
