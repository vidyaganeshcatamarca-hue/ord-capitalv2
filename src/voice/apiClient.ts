// src/voice/apiClient.ts
// ============================================
// Voice v1 - HTTP client for the voice backend
// ============================================
import {
  VOICE_API_BASE_URL,
  VOICE_JOB_CREATE_PATH,
  VOICE_JOB_POLL_PATH,
  BUG_REPORT_TRANSLATE_PATH,
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
 * Owner bug: the backend has no timeout of its own, so a down/unhanging
 * server left the "enviando audio…" spinner alive for minutes (the browser
 * fetch never gave up). Every voice call now bounds its request: at the mark
 * the fetch is aborted with a `TimeoutError` reason — deliberately NOT an
 * `AbortError`, so user cancellation and this transport timeout stay
 * distinguishable: the timeout maps to the ordinary NETWORK error path.
 */
const VOICE_REQUEST_TIMEOUT_MS = 15000;

async function fetchBounded(
  url: string,
  options: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutReason = new DOMException('Voice request timed out', 'TimeoutError');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onOuterAbort = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort(signal?.reason);
  };
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else if (signal) {
    signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  timer = setTimeout(() => controller.abort(timeoutReason), VOICE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Enqueues a new voice job.
 * Accepts 200 (idempotent hit, `reused: true`) and 202 (new job) as success.
 * The `Content-Type` header is intentionally never set so the browser can add
 * the multipart boundary.
 */
export async function createVoiceJob(input: CreateVoiceJobInput): Promise<VoiceJobCreate> {
  const { audioBlob, idempotencyKey, language, context, accessToken, signal } = input;

  // Backend-requested diagnostic: the exact final context that goes into the
  // multipart, logged only in dev builds (npm run dev). Remove once the
  // categorization matching is validated.
  if (import.meta.env.DEV) {
    console.log('VOICE_CONTEXT expense_categories', JSON.stringify(context.expense_categories, null, 2));
  }

  let response: Response;
  try {
    response = await fetchBounded(
      `${VOICE_API_BASE_URL}${VOICE_JOB_CREATE_PATH}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: buildVoiceJobFormData({ audioBlob, idempotencyKey, language, context }),
      },
      signal
    );
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

/** Discriminator the backend expects for bug-report voice jobs. */
const BUG_REPORT_JOB_KIND = 'bug_report';

/** Input required to enqueue a new bug-report voice job. */
export interface CreateBugReportJobInput {
  audioBlob: Blob;
  idempotencyKey: string;
  language: string;
  accessToken: string;
  signal?: AbortSignal;
  /** Optional codec hint; omitted by default so the backend detects it. */
  audioCodec?: string;
}

/**
 * Enqueues a bug-report voice job (`kind=bug_report`).
 * The multipart never carries a `context` field: the bug-report contract is
 * audio + idempotency key + language + kind (+ optional codec) only.
 * Accepts 200 (idempotent hit, `reused: true`) and 202 (new job), with the
 * same envelope handling as `createVoiceJob`.
 */
export async function createBugReportJob(
  input: CreateBugReportJobInput
): Promise<VoiceJobCreate> {
  const { audioBlob, idempotencyKey, language, accessToken, signal, audioCodec } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${VOICE_API_BASE_URL}${VOICE_JOB_CREATE_PATH}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: buildVoiceJobFormData({
          audioBlob,
          idempotencyKey,
          language,
          kind: BUG_REPORT_JOB_KIND,
          audioCodec,
        }),
      },
      signal
    );
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
    response = await fetchBounded(
      `${VOICE_API_BASE_URL}${VOICE_JOB_POLL_PATH(jobId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      signal
    );
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

/** Input required to read the transcript of a completed bug-report job. */
export interface GetBugReportTranscriptInput {
  jobId: string;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Reads `result.transcript` of a completed bug-report job from the poll
 * endpoint. `getVoiceJob` intentionally discards any `result` that is not a
 * movements payload, so the transcript needs this sibling reader over the same
 * endpoint with the same fetch and error-envelope handling.
 */
export async function getBugReportTranscript(
  input: GetBugReportTranscriptInput
): Promise<string> {
  const { jobId, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${VOICE_API_BASE_URL}${VOICE_JOB_POLL_PATH(jobId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      signal
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw createNetworkError(mapVoiceErrorToI18nKey('NETWORK'), detailFromError(error));
  }

  if (response.status !== 200) {
    throw await buildHttpError(response);
  }

  const body = await readJsonBody(response);
  const result =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).result
      : null;
  const transcript =
    typeof result === 'object' && result !== null
      ? (result as Record<string, unknown>).transcript
      : null;
  if (typeof transcript !== 'string' || transcript.trim().length === 0) {
    throw new VoiceApiError(
      'UNKNOWN',
      mapVoiceErrorToI18nKey('UNKNOWN'),
      response.status,
      'Bug report job result is missing a transcript'
    );
  }
  return transcript;
}

/** Stable fallback code when the translate endpoint fails without a usable envelope. */
const BUG_REPORT_TRANSLATION_FAILED = 'BUG_REPORT_TRANSLATION_FAILED';

/** Input required to translate a written bug-report description. */
export interface TranslateBugReportTextInput {
  /** Written description only: never the title, manifests or media. */
  text: string;
  /** BCP-47 tag of the user locale (e.g. 'es-AR'). */
  language: string;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Result of the written-text translation step. On failure the endpoint never
 * reaches `fn_crear_reporte`: `errorCode` carries the stable backend code and
 * `text` stays empty, so callers can branch all-or-nothing without exceptions.
 */
export interface TranslateBugReportTextResult {
  /** Final Spanish text, only meaningful when `errorCode` is undefined. */
  text: string;
  /** Backend decided a translation was actually needed. */
  translated: boolean;
  errorCode?: string;
}

/** Extracts the stable { error: { code } } code from a translate error body. */
function parseBugReportTranslationErrorCode(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const error = (body as Record<string, unknown>).error;
    if (typeof error === 'object' && error !== null) {
      const code = (error as Record<string, unknown>).code;
      if (typeof code === 'string' && code.length > 0) return code;
    }
  }
  return BUG_REPORT_TRANSLATION_FAILED;
}

/**
 * Translates a written bug-report description into Spanish.
 * The frontend always routes written text through this endpoint; the backend
 * decides whether a translation is needed (`translated: false` when the text
 * is already Spanish). Aborts are rethrown unchanged and network failures use
 * the shared `VoiceApiError` transport error, like the other calls here; every
 * non-2xx response is reported as a result with its stable `errorCode`.
 */
export async function translateBugReportText(
  input: TranslateBugReportTextInput
): Promise<TranslateBugReportTextResult> {
  const { text, language, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${VOICE_API_BASE_URL}${BUG_REPORT_TRANSLATE_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text, language }),
      },
      signal
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw createNetworkError(SEND_FAILED_I18N_KEY, detailFromError(error));
  }

  if (response.status !== 200) {
    const body = await readJsonBody(response);
    return {
      text: '',
      translated: false,
      errorCode: parseBugReportTranslationErrorCode(body),
    };
  }

  const body = await readJsonBody(response);
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const finalText = typeof record?.text === 'string' ? record.text : '';
  if (finalText.trim().length === 0) {
    // 200 without a usable text is a failed translation, never a pass-through.
    return { text: '', translated: false, errorCode: BUG_REPORT_TRANSLATION_FAILED };
  }
  return { text: finalText, translated: record?.translated === true };
}
