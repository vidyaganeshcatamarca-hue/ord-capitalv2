// src/voice/useVoiceQuarantine.ts
// ============================================
// Voice v1 - Quarantine hand-off
// ============================================
// Persists the movements resolved for a finished voice job into the quarantine
// tray through `fn_cargar_movimientos_voz`.
//
// That RPC is NOT idempotent: its EXISTS checks validate foreign keys, they do
// not dedupe. Calling it twice for the same job inserts the movements twice, so
// this hook guarantees a single dispatch per job id even under StrictMode
// double-invocation or repeated effect runs.
import { useCallback, useRef, useState } from 'react';
import { rpc } from '@/lib/supabase';
import type { VoiceMovement } from './types';

/** Per-movement result row returned by `fn_cargar_movimientos_voz`. */
export interface VoiceQuarantineLoadRow {
  voice_movement_index: number;
  pendiente_id: number | null;
  ok: boolean;
  error_key: string | null;
}

/** Public surface of `useVoiceQuarantine`. */
export interface UseVoiceQuarantineResult {
  /** True while a dispatch is in flight. */
  loading: boolean;
  /** i18n key of the last failed dispatch, or null. */
  errorI18nKey: string | null;
  /** Dispatches a job's movements once; resolves to true when the RPC succeeded. */
  loadQuarantine(jobId: string, movements: VoiceMovement[]): Promise<boolean>;
  /** Retries a previously failed dispatch, reusing the same job id. */
  refresh(jobId: string, movements: VoiceMovement[]): Promise<boolean>;
}

/**
 * Hands a completed voice job to the quarantine.
 *
 * The hook is intentionally stateless about the job itself: the caller owns the
 * job lifecycle, this only owns the one-shot dispatch guarantee.
 */
export function useVoiceQuarantine(): UseVoiceQuarantineResult {
  const [loading, setLoading] = useState(false);
  const [errorI18nKey, setErrorI18nKey] = useState<string | null>(null);

  // Job ids already handed to the RPC. A ref so the guard survives re-renders
  // and is read synchronously before the first await.
  const dispatchedRef = useRef<Set<string>>(new Set());

  const dispatch = useCallback(
    async (jobId: string, movements: VoiceMovement[], force: boolean): Promise<boolean> => {
      if (!jobId) return false;
      // Already dispatched: a repeated effect must not insert a second copy.
      if (!force && dispatchedRef.current.has(jobId)) return true;

      // Marked before awaiting so a StrictMode re-invocation is a no-op.
      dispatchedRef.current.add(jobId);
      setLoading(true);
      setErrorI18nKey(null);

      try {
        await rpc<VoiceQuarantineLoadRow[]>('fn_cargar_movimientos_voz', {
          p_job_id: jobId,
          p_movements: movements,
        });
        return true;
      } catch (err) {
        // Per-movement problems surface through the row metadata in the tray;
        // a thrown error means the whole batch never reached the database.
        console.warn('voice quarantine load failed:', err);
        setErrorI18nKey('voice_load_failed');
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadQuarantine = useCallback(
    (jobId: string, movements: VoiceMovement[]): Promise<boolean> =>
      dispatch(jobId, movements, false),
    [dispatch]
  );

  const refresh = useCallback(
    (jobId: string, movements: VoiceMovement[]): Promise<boolean> =>
      dispatch(jobId, movements, true),
    [dispatch]
  );

  return { loading, errorI18nKey, loadQuarantine, refresh };
}
