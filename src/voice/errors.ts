// src/voice/errors.ts
// ============================================
// Voice v1 - Backend error code to i18n key mapping
// ============================================

/** Maps a backend voice error code to its i18n key. */
export const VOICE_ERROR_CODE_TO_I18N_KEY: Record<string, string> = {
  AUDIO_LIMIT_EXCEEDED: 'voice_audio_too_long',
  UNSUPPORTED_AUDIO: 'voice_unsupported_audio',
  TOO_MANY_ACTIVE_JOBS: 'voice_too_many_jobs',
  CONTEXT_TOO_LARGE: 'voice_context_too_large',
  RATE_LIMITED: 'voice_rate_limited',
  SERVICE_UNAVAILABLE: 'voice_service_unavailable',
  UNAUTHORIZED: 'voice_unauthorized',
  FORBIDDEN: 'voice_unauthorized',
  NOT_FOUND: 'voice_generic_error',
  BAD_REQUEST: 'voice_generic_error',
  CONFLICT: 'voice_generic_error',
  INVALID_REQUEST: 'voice_generic_error',
  INTERNAL_ERROR: 'voice_service_unavailable',
  NETWORK: 'voice_network_error',
  UNKNOWN: 'voice_generic_error',
};

const DEFAULT_ERROR_KEY = 'voice_generic_error';

/** Resolves a backend error code to an i18n key, falling back to a generic key. */
export function mapVoiceErrorToI18nKey(code: string): string {
  return VOICE_ERROR_CODE_TO_I18N_KEY[code] || DEFAULT_ERROR_KEY;
}

/** Parses a FastAPI error body into { code, i18nKey, message } with safe fallbacks. */
export function parseFastApiError(json: unknown): { code: string; i18nKey: string; message: string } {
  // Assumed minimal shape: { schema_version, status: 'error', error: { code, message } }
  let code = 'UNKNOWN';
  let message = '';
  if (typeof json === 'object' && json !== null) {
    const obj = json as Record<string, unknown>;
    const err = obj.error;
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e.code === 'string') code = e.code;
      if (typeof e.message === 'string') message = e.message;
    }
  }
  return { code, i18nKey: mapVoiceErrorToI18nKey(code), message };
}
