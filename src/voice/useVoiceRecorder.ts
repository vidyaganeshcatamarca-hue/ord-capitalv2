// src/voice/useVoiceRecorder.ts
// ============================================
// Voice v1 - MediaRecorder hook with a hard 30s cut
// ============================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { isBrowserSupported, pickSupportedMime, type SupportedMime } from './codec';
import { MAX_AUDIO_DURATION_MS } from './contract';

/** Lifecycle of the recorder. */
export type VoiceRecorderState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'recorded'
  | 'error';

/** Recorder failure carrying the i18n key the UI must render. */
export interface VoiceRecorderError {
  i18nKey: string;
  detail?: string;
}

/** Public surface of `useVoiceRecorder`. */
export interface UseVoiceRecorderResult {
  state: VoiceRecorderState;
  seconds: number;
  remainingSeconds: number;
  blob: Blob | null;
  mimeType: string | null;
  error: VoiceRecorderError | null;
  /**
   * True only when the 30s hard cut stopped the recorder on its own.
   * The UI must never upload that blob: it only offers a fresh recording.
   */
  autoStopped: boolean;
  start(): Promise<void>;
  /**
   * Stops the recorder. Pass `true` from the internal 30s cut so the caller can
   * tell an automatic stop from the user releasing the button.
   */
  stop(autoStopped?: boolean): void;
  cancel(): void;
}

const CODEC_UNSUPPORTED_KEY = 'voice.codec_unsupported';
const MIC_DENIED_KEY = 'voice.mic_denied';
const GENERIC_ERROR_KEY = 'voice_generic_error';

/** Permission-family rejections mean the user has to grant access. */
const MIC_DENIED_ERROR_NAMES: readonly string[] = [
  'NotAllowedError',
  'PermissionDeniedError',
  'SecurityError',
];

function errorNameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return '';
}

/** Classifies a getUserMedia rejection into an i18n key. */
function classifyMicrophoneError(error: unknown): VoiceRecorderError {
  const detail = error instanceof Error ? error.message : String(error);
  if (MIC_DENIED_ERROR_NAMES.includes(errorNameOf(error))) {
    return { i18nKey: MIC_DENIED_KEY, detail };
  }
  return { i18nKey: GENERIC_ERROR_KEY, detail };
}

/**
 * Records a voice note in memory. The hook never uploads: `useVoiceJobs` owns
 * submission so the recorder stays focused on the MediaRecorder lifecycle.
 */
export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<VoiceRecorderError | null>(null);
  const [autoStopped, setAutoStopped] = useState(false);

  const mountedRef = useRef(true);
  const stateRef = useRef<VoiceRecorderState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  // Read by `onstop`, which fires asynchronously after the stop request.
  const autoStoppedRef = useRef(false);
  const stopRef = useRef<(autoStopped?: boolean) => void>(() => undefined);

  const commitState = useCallback((next: VoiceRecorderState): void => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const clearTicker = useCallback((): void => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const releaseStream = useCallback((): void => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Stopping an already-ended track is not an error worth reporting.
      }
    }
    streamRef.current = null;
  }, []);

  const stopTracksAndRecorder = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // The recorder may already be shutting down.
        }
      }
      recorderRef.current = null;
    }
    releaseStream();
    clearTicker();
    startedAtRef.current = null;
  }, [clearTicker, releaseStream]);

  const stop = useCallback((stoppedAutomatically = false): void => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      clearTicker();
      return;
    }
    clearTicker();
    discardRef.current = false;
    autoStoppedRef.current = stoppedAutomatically;
    try {
      recorder.stop();
    } catch {
      // Ignore: onstop will not fire, so recover to a clean idle state.
      stopTracksAndRecorder();
      commitState('idle');
    }
  }, [clearTicker, commitState, stopTracksAndRecorder]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const cancel = useCallback((): void => {
    discardRef.current = true;
    autoStoppedRef.current = false;
    chunksRef.current = [];
    stopTracksAndRecorder();
    if (mountedRef.current) {
      setBlob(null);
      setSeconds(0);
      setError(null);
      setAutoStopped(false);
    }
    commitState('idle');
  }, [commitState, stopTracksAndRecorder]);

  const start = useCallback(async (): Promise<void> => {
    if (stateRef.current === 'recording' || stateRef.current === 'requesting_permission') return;

    if (!isBrowserSupported()) {
      commitState('error');
      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });
      return;
    }

    const supportedMime: SupportedMime | null = pickSupportedMime();
    if (!supportedMime) {
      commitState('error');
      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });
      return;
    }

    commitState('requesting_permission');
    if (mountedRef.current) {
      setError(null);
      setBlob(null);
      setSeconds(0);
      setAutoStopped(false);
    }
    autoStoppedRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (micError) {
      const classified = classifyMicrophoneError(micError);
      commitState('error');
      if (mountedRef.current) setError(classified);
      return;
    }

    if (!mountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    discardRef.current = false;
    streamRef.current = stream;
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: supportedMime });
    } catch (recordError) {
      releaseStream();
      commitState('error');
      if (mountedRef.current) {
        setError({
          i18nKey: GENERIC_ERROR_KEY,
          detail: recordError instanceof Error ? recordError.message : undefined,
        });
      }
      return;
    }

    recorderRef.current = recorder;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      discardRef.current = true;
      autoStoppedRef.current = false;
      stopTracksAndRecorder();
      commitState('error');
      if (mountedRef.current) setError({ i18nKey: GENERIC_ERROR_KEY });
    };
    recorder.onstop = () => {
      const capturedType = recorder.mimeType || supportedMime;
      const capturedChunks = chunksRef.current;
      chunksRef.current = [];
      const discarded = discardRef.current;
      discardRef.current = false;
      recorderRef.current = null;
      releaseStream();
      clearTicker();
      startedAtRef.current = null;

      if (discarded || !mountedRef.current) return;

      // The automatic flag is published together with `state: 'recorded'` so the
      // UI never sees a cut blob without knowing where it came from.
      const stoppedAutomatically = autoStoppedRef.current;
      autoStoppedRef.current = false;

      setBlob(new Blob(capturedChunks, { type: capturedType }));
      setMimeType(capturedType);
      setAutoStopped(stoppedAutomatically);
      commitState('recorded');
    };

    if (mountedRef.current) {
      setMimeType(supportedMime);
      setSeconds(0);
    }

    startedAtRef.current = Date.now();
    try {
      recorder.start();
    } catch (startError) {
      stopTracksAndRecorder();
      commitState('error');
      if (mountedRef.current) {
        setError({
          i18nKey: GENERIC_ERROR_KEY,
          detail: startError instanceof Error ? startError.message : undefined,
        });
      }
      return;
    }
    commitState('recording');

    clearTicker();
    intervalRef.current = setInterval(() => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      const elapsedMs = Date.now() - startedAt;
      if (mountedRef.current) setSeconds(Math.floor(elapsedMs / 1000));
      if (elapsedMs >= MAX_AUDIO_DURATION_MS) {
        // Hard cut at 30s: the recorder is stopped without user interaction.
        // Flagged as automatic so the UI discards the blob instead of sending it.
        stopRef.current(true);
      }
    }, 1000);
  }, [clearTicker, commitState, releaseStream, stopTracksAndRecorder]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      chunksRef.current = [];
      stopTracksAndRecorder();
    };
  }, [stopTracksAndRecorder]);

  const maxSeconds = Math.floor(MAX_AUDIO_DURATION_MS / 1000);

  return {
    state,
    seconds,
    remainingSeconds: Math.max(0, maxSeconds - seconds),
    blob,
    mimeType,
    error,
    autoStopped,
    start,
    stop,
    cancel,
  };
}
