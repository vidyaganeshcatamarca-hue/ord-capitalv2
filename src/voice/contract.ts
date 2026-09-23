// src/voice/contract.ts
// ============================================
// Voice v1 - HTTP contract, limits and request builders
// ============================================
import type { VoiceContext, VoiceErrorEnvelope } from './types';

/** Base URL of the voice backend (FastAPI service, not Supabase). */
export const VOICE_API_BASE_URL = 'https://api.ordcapital.app' as const;

/** Path used to enqueue a new voice job. */
export const VOICE_JOB_CREATE_PATH = '/v1/voice/jobs' as const;

/** Builds the polling path for a previously created voice job. */
export const VOICE_JOB_POLL_PATH = (jobId: string): string => `/v1/voice/jobs/${jobId}`;

/** Maximum accepted audio duration, in milliseconds. */
export const MAX_AUDIO_DURATION_MS = 30000;

/** Maximum accepted audio payload size, in bytes (2 MB). */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** Maximum accepted serialized context size, in bytes (512 KB). */
export const MAX_CONTEXT_BYTES = 512 * 1024;

/** Maximum number of concurrent active jobs allowed per user. */
export const MAX_ACTIVE_JOBS_PER_USER = 10;

/** Maximum number of jobs a single user may enqueue per minute. */
export const MAX_JOBS_PER_MINUTE_PER_USER = 10;

/** Input required to build the multipart body for a voice job. */
export interface BuildVoiceJobFormDataInput {
  audioBlob: Blob;
  idempotencyKey: string;
  language: string;
  context: VoiceContext;
}

/**
 * Builds the multipart/form-data body for the enqueue request.
 * The audio codec is never sent explicitly; the backend detects it with ffprobe.
 */
export function buildVoiceJobFormData(input: BuildVoiceJobFormDataInput): FormData {
  const { audioBlob, idempotencyKey, language, context } = input;
  const formData = new FormData();
  const mimeType = audioBlob.type || 'application/octet-stream';
  formData.append('audio', audioBlob, `voice.${mimeType.split('/')[1] || 'bin'}`);
  formData.append('idempotency_key', idempotencyKey);
  formData.append('language', language);
  formData.append('context', JSON.stringify(context));
  // NOTE: 'audio_codec' is intentionally omitted - the backend detects it with ffprobe.
  return formData;
}

/** Extracts { code, message } from an unknown JSON error body, with safe fallbacks. */
export function parseVoiceErrorResponse(json: unknown): { code: string; message: string } {
  if (typeof json !== 'object' || json === null) {
    return { code: 'UNKNOWN', message: '' };
  }
  const envelope = json as Partial<VoiceErrorEnvelope>;
  if (envelope.status === 'error' && envelope.error && typeof envelope.error.code === 'string') {
    return { code: envelope.error.code, message: envelope.error.message || '' };
  }
  return { code: 'UNKNOWN', message: '' };
}

/** Returns true when the serialized context stays within MAX_CONTEXT_BYTES. */
export function validateContextSize(context: VoiceContext): boolean {
  return JSON.stringify(context).length <= MAX_CONTEXT_BYTES;
}

/** Validates an audio blob against size limits before upload. */
export function validateAudioBlob(blob: Blob): { ok: true } | { ok: false; reason: 'too_big' | 'empty' } {
  if (blob.size <= 0) return { ok: false, reason: 'empty' };
  if (blob.size > MAX_AUDIO_BYTES) return { ok: false, reason: 'too_big' };
  return { ok: true };
}
