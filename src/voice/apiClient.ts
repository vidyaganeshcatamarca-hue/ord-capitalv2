// src/voice/apiClient.ts
// ============================================
// Voice v1 - HTTP client for the voice backend
// ============================================
import {
  VOICE_API_BASE_URL,
  VOICE_JOB_CREATE_PATH,
  VOICE_JOB_POLL_PATH,
  buildVoiceJobFormData,
  parseVoiceErrorResponse,
} from './contract';
import { mapVoiceErrorToI18nKey } from './errors';
import type {
  VoiceContext,
  VoiceJob,
  VoiceJobCreate,
  VoiceJobStage,
  VoiceJobStatus,
  VoiceMovement,
} from './types';

/**
 * Default BCP-47 language tag sent with every job.
 * i18n only ships `es` today, so voice jobs are always requested as `es-AR`.
 */
export const DEFAULT_VOICE_LANGUAGE = 'es-AR' as const;

/** i18n key used when the enqueue request never reaches the backend. */
const SEND_FAILED_I18N_KEY = 'voice_send_failed';

/**
 * Typed transport error for every voice backend interaction.
 * `code` is either a FastAPI error code or the local `NETWORK` / `UNKNOWN` codes.
 */
export class VoiceApiError extends Error {
  readonly code: string;
  readonly i18nKey: string;
  readonly httpStatus: number | null;

  constructor(code: string, i18nKey: string, httpStatus: number | null, message?: string) {
    super(message ?? code);
    this.name = 'VoiceApiError';
    this.code = code;
    this.i18nKey = i18nKey;
    this.httpStatus = httpStatus;
  }
}

/** Input required to enqueue a new voice job. */
export interface CreateVoiceJobInput {
  audioBlob: Blob;
  idempotencyKey: string;
  language: string;
  context: VoiceContext;
  accessToken: string;
  signal?: AbortSignal;
}

/** Input required to poll an existing voice job. */
export interface GetVoiceJobInput {
  jobId: string;
  accessToken: string;
  signal?: AbortSignal;
}

/** Maps an HTTP status to the closest backend error code from the errors table. */
export function voiceErrorCodeFromHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'AUDIO_LIMIT_EXCEEDED';
    case 422:
      return 'INVALID_REQUEST';
    case 429:
      return 'RATE_LIMITED';
    case 500:
      return 'INTERNAL_ERROR';
    case 502:
    case 503:
    case 504:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Returns true when the rejection was produced by an aborted request.
 * Aborts are propagated unchanged so callers can tell cancellation apart from a
 * transport failure and never report a spurious network error on unmount.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

const VOICE_JOB_STATUSES: readonly string[] = [
  'queued',
  'processing',
  'retry_wait',
  'completed',
  'terminal_failed',
];

const VOICE_JOB_STAGES: readonly string[] = [
  'queued',
  'transcribing',
  'interpreting',
  'finalizing',
  'done',
];

/** Minimal shape we require from the enqueue response. */
interface VoiceJobCreateLike {
  schema_version?: unknown;
  job_id: string;
  reused?: unknown;
}

/** Minimal shape we require from the polling response. */
type VoiceJobLike = Record<string, unknown> & { job_id: string; status: string };

function isVoiceJobCreateLike(value: unknown): value is VoiceJobCreateLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.job_id === 'string' && candidate.job_id.length > 0;
}

function isVoiceJobLike(value: unknown): value is VoiceJobLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.job_id === 'string' &&
    candidate.job_id.length > 0 &&
    typeof candidate.status === 'string'
  );
}

function isMovementResult(value: unknown): value is { movements: VoiceMovement[] } {
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray((value as Record<string, unknown>).movements);
}

/**
 * Keeps an unknown status as `processing` so polling continues instead of
 * discarding a job that may still complete. The moment the backend reports a
 * recognized status the normal transitions apply again.
 */
function normalizeJobStatus(value: unknown): VoiceJobStatus {
  if (typeof value === 'string' && VOICE_JOB_STATUSES.includes(value)) {
    return value as VoiceJobStatus;
  }
  return 'processing';
}

function normalizeJobStage(value: unknown): VoiceJobStage {
  if (typeof value === 'string' && VOICE_JOB_STAGES.includes(value)) {
    return value as VoiceJobStage;
  }
  return 'queued';
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    // Empty or non-JSON body: callers fall back to the HTTP status mapping.
    return null;
  }
}

async function buildHttpError(response: Response): Promise<VoiceApiError> {
  const body = await readJsonBody(response);
  const parsed = parseVoiceErrorResponse(body);
  const code =
    parsed.code === 'UNKNOWN' ? voiceErrorCodeFromHttpStatus(response.status) : parsed.code;
  return new VoiceApiError(code, mapVoiceErrorToI18nKey(code), response.status, parsed.message);
}

function createNetworkError(i18nKey: string, detail: string): VoiceApiError {
  return new VoiceApiError('NETWORK', i18nKey, null, detail);
}

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Voice request failed';
}

/**
 * Enqueues a new voice job.
 * Accepts 200 (idempotent hit, `reused: true`) and 202 (new job) as success.
 * The `Content-Type` header is intentionally never set so the browser can add
 * the multipart boundary.
 */
export async function createVoiceJob(input: CreateVoiceJobInput): Promise<VoiceJobCreate> {
  const { audioBlob, idempotencyKey, language, context, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetch(`${VOICE_API_BASE_URL}${VOICE_JOB_CREATE_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: buildVoiceJobFormData({ audioBlob, idempotencyKey, language, context }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw createNetworkError(SEND_FAILED_I18N_KEY, detailFromError(error));
  }

  if (response.status !== 200 && response.status !== 202) {
    throw await buildHttpError(response);
  }

  const body = await readJsonBody(response);
  if (!isVoiceJobCreateLike(body)) {
    throw new VoiceApiError(
      'UNKNOWN',
      mapVoiceErrorToI18nKey('UNKNOWN'),
      response.status,
      'Voice job response is missing job_id'
    );
  }

  return {
    schema_version: typeof body.schema_version === 'number' ? body.schema_version : 1,
    job_id: body.job_id,
    status: 'queued',
    stage: 'queued',
    reused: body.reused === true,
  };
}

/** Polls a voice job. A 404 is reported as `NOT_FOUND`. */
export async function getVoiceJob(input: GetVoiceJobInput): Promise<VoiceJob> {
  const { jobId, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetch(`${VOICE_API_BASE_URL}${VOICE_JOB_POLL_PATH(jobId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw createNetworkError(mapVoiceErrorToI18nKey('NETWORK'), detailFromError(error));
  }

  if (response.status !== 200) {
    throw await buildHttpError(response);
  }

  const body = await readJsonBody(response);
  if (!isVoiceJobLike(body)) {
    throw new VoiceApiError(
      'UNKNOWN',
      mapVoiceErrorToI18nKey('UNKNOWN'),
      response.status,
      'Voice job response is malformed'
    );
  }

  return {
    schema_version: typeof body.schema_version === 'number' ? body.schema_version : 1,
    job_id: body.job_id,
    status: normalizeJobStatus(body.status),
    stage: normalizeJobStage(body.stage),
    result_schema_version:
      typeof body.result_schema_version === 'number' ? body.result_schema_version : null,
    result: isMovementResult(body.result) ? body.result : null,
    error_code: asStringOrNull(body.error_code),
    created_at: typeof body.created_at === 'string' ? body.created_at : '',
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : '',
    completed_at: asStringOrNull(body.completed_at),
    failed_at: asStringOrNull(body.failed_at),
  };
}
