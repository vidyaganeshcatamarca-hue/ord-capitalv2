// src/ocr/apiClient.ts
// ============================================
// OCR v1 - HTTP client for the OCR backend
// ============================================
//
// Normative source: contract v1 §3, §5, §7, §20 and definitive PRD §26, §35,
// §69-§74, §98. The OCR backend is a dependency: nothing here tries to change
// it. Transport failures always surface as a stable `code`, never as free text
// that could leak ticket content into telemetry (PRD §74, §97).

import {
  OCR_API_BASE_URL,
  OCR_CATEGORY_MEMORY_PATH,
  OCR_JOB_CREATE_PATH,
  OCR_JOB_POLL_PATH,
  buildOcrJobFormData,
  ocrErrorCodeFromHttpStatus,
  parseOcrErrorResponse,
} from './contract';
import { normalizeOcrResult } from './normalize';
import { ocrErrorI18nKey, ocrUploadErrorI18nKey } from './errors';
import type { OcrIssue, OcrJob, OcrJobAccepted, OcrJobStatus } from './types';
import type { OcrNetworkDetail } from './telemetryProps';

/** Typed transport error for every OCR backend interaction. */
export class OcrApiError extends Error {
  readonly code: string;
  readonly i18nKey: string;
  readonly httpStatus: number | null;

  constructor(code: string, i18nKey: string, httpStatus: number | null, message?: string) {
    super(message ?? code);
    this.name = 'OcrApiError';
    this.code = code;
    this.i18nKey = i18nKey;
    this.httpStatus = httpStatus;
  }
}

/** Bounded request window: a hung server must not freeze the upload UI. */
const OCR_REQUEST_TIMEOUT_MS = 60000;

/** Uploads a ticket: heavy multipart, so the window is generous but bounded. */
const OCR_UPLOAD_TIMEOUT_MS = 180000;

const OCR_JOB_STATUSES: readonly string[] = [
  'queued',
  'processing',
  'waiting_for_inference',
  'classifying',
  'completed',
  'needs_review',
  'failed',
  'cancelled',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    const raw = await response.text();
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * `fetch` bounded by a timeout. The timeout is aborted with a `TimeoutError`
 * reason — deliberately NOT an `AbortError` — so a caller-driven cancellation
 * stays distinguishable from a transport timeout.
 */
async function fetchBounded(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutReason = new DOMException('OCR request timed out', 'TimeoutError');
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
  timer = setTimeout(() => controller.abort(timeoutReason), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Resolves the OCR API base at runtime so the endpoint can be pointed without
 * touching code (PRD §127: the OCR service is a dependency and its public host
 * is deployment configuration, not a frontend constant).
 *
 * Kept inside a function on purpose: a module-level `import.meta.env` read would
 * break the plain-Node test imports.
 */
export function resolveOcrApiBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    const configured = env?.VITE_OCR_API_BASE_URL;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.trim().replace(/\/+$/, '');
    }
  } catch {
    // No Vite env (tests, SSR): fall through to the shared host.
  }
  return OCR_API_BASE_URL;
}

/**
 * `surface` decides which message the user sees: a 404 while uploading means the
 * endpoint is missing, a 404 while polling means the job is gone. Same status,
 * opposite meanings.
 */
async function buildHttpError(
  response: Response,
  surface: 'upload' | 'poll' = 'poll'
): Promise<OcrApiError> {
  const body = await readJsonBody(response);
  const parsed = parseOcrErrorResponse(body);
  const code = parsed.code === 'UNKNOWN' ? ocrErrorCodeFromHttpStatus(response.status) : parsed.code;
  const i18nKey = surface === 'upload' ? ocrUploadErrorI18nKey(code) : ocrErrorI18nKey(code);
  return new OcrApiError(code, i18nKey, response.status, parsed.message);
}

function networkError(detail: string): OcrApiError {
  return new OcrApiError('NETWORK', ocrErrorI18nKey('NETWORK'), null, detail);
}

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'OCR request failed';
}

/**
 * Turns a failed transport attempt into the three closed fields telemetry is
 * allowed to carry (PRD §70, §97): a reason from a closed set, how long it took,
 * and whether the device believed it was online. The exception message itself
 * never travels: it is the one field that could leak ticket content.
 */
export function describeOcrNetworkFailure(
  error: unknown,
  elapsedMs: number
): { net_detail: OcrNetworkDetail; elapsed_ms: number; online: boolean } {
  let netDetail: OcrNetworkDetail = 'other';
  if (isAbortError(error)) {
    netDetail = 'abort';
  } else if (error instanceof OcrApiError && /timed out/i.test(error.message)) {
    netDetail = 'timeout';
  } else if (error instanceof OcrApiError && error.code === 'NETWORK') {
    netDetail = 'failed_to_fetch';
  }
  const online =
    typeof navigator === 'undefined' || navigator.onLine !== false;
  return { net_detail: netDetail, elapsed_ms: Math.max(0, Math.round(elapsedMs)), online };
}

/**
 * Unknown statuses stay `processing` on purpose: discarding a job that may
 * still finish would strand a received ticket. Once the backend reports a known
 * status the normal transitions apply again.
 */
function normalizeStatus(value: unknown): OcrJobStatus {
  if (typeof value === 'string' && OCR_JOB_STATUSES.includes(value)) return value as OcrJobStatus;
  return 'processing';
}

function normalizeIssues(value: unknown): OcrIssue[] {
  const list = Array.isArray(value) ? value : [];
  const out: OcrIssue[] = [];
  for (const entry of list) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      out.push({ code: entry.trim(), item_index: null, field: null });
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const code = asStringOrNull(record.code) ?? asStringOrNull(record.key);
    if (!code) continue;
    const itemIndex = record.item_index;
    out.push({
      code,
      item_index: typeof itemIndex === 'number' ? itemIndex : null,
      field: asStringOrNull(record.field),
    });
  }
  return out;
}

export interface CreateOcrJobInput {
  files: readonly File[];
  /** ORD snapshot built by `buildOcrContext`. */
  context: unknown;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Uploads a ticket. `duplicate: true` is NOT an error (contract v1 §6): the
 * returned `job_id` is used exactly like the original upload.
 */
export async function createOcrJob(input: CreateOcrJobInput): Promise<OcrJobAccepted> {
  const { files, context, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${resolveOcrApiBaseUrl()}${OCR_JOB_CREATE_PATH}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: buildOcrJobFormData({ files, context }),
      },
      OCR_UPLOAD_TIMEOUT_MS,
      signal
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw networkError(detailFromError(error));
  }

  if (response.status !== 200 && response.status !== 201 && response.status !== 202) {
    throw await buildHttpError(response, 'upload');
  }

  const body = asRecord(await readJsonBody(response));
  const jobId = body ? asStringOrNull(body.job_id) : null;
  if (!jobId) {
    throw new OcrApiError('UNKNOWN', ocrErrorI18nKey('UNKNOWN'), response.status, 'OCR job response is missing job_id');
  }

  return {
    job_id: jobId,
    accepted: body?.accepted !== false,
    upload_complete: body?.upload_complete !== false,
    duplicate: body?.duplicate === true,
    status: normalizeStatus(body?.status),
    processing_pending: body?.processing_pending !== false,
    should_upload_again: body?.should_upload_again === true,
    message_code: asStringOrNull(body?.message_code),
  };
}

export interface GetOcrJobInput {
  jobId: string;
  accessToken: string;
  signal?: AbortSignal;
}

/** Polls one job. A 404 is reported as `NOT_FOUND`. */
export async function getOcrJob(input: GetOcrJobInput): Promise<OcrJob> {
  const { jobId, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${resolveOcrApiBaseUrl()}${OCR_JOB_POLL_PATH(jobId)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
      OCR_REQUEST_TIMEOUT_MS,
      signal
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw networkError(detailFromError(error));
  }

  if (response.status !== 200) throw await buildHttpError(response);

  const body = asRecord(await readJsonBody(response));
  const status = normalizeStatus(body?.status);
  const rawResult = body?.result ?? null;
  const ticket = status === 'completed' || status === 'needs_review'
    ? normalizeOcrResult(jobId, rawResult)
    : null;

  return {
    job_id: asStringOrNull(body?.job_id) ?? jobId,
    status,
    issues: normalizeIssues(body?.issues),
    ticket,
    raw_result: rawResult,
    error_code: asStringOrNull(body?.error_code),
    message_code: asStringOrNull(body?.message_code),
    created_at: asStringOrNull(body?.created_at) ?? '',
    updated_at: asStringOrNull(body?.updated_at) ?? '',
  };
}

export interface RegisterCategoryMemoryInput {
  jobId: string;
  itemIndex: number;
  categoryId: string;
  categoryName: string;
  categoryParentName: string | null;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Registers one explicit category correction (PRD §22).
 * The product description is NEVER sent: the backend recovers it from the
 * persisted OCR result, so a visual edit cannot change the memory key.
 */
export async function registerCategoryMemory(input: RegisterCategoryMemoryInput): Promise<boolean> {
  const { jobId, itemIndex, categoryId, categoryName, categoryParentName, accessToken, signal } = input;

  let response: Response;
  try {
    response = await fetchBounded(
      `${resolveOcrApiBaseUrl()}${OCR_CATEGORY_MEMORY_PATH(jobId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          item_index: itemIndex,
          category_id: categoryId,
          category_name: categoryName,
          category_parent_name: categoryParentName,
        }),
      },
      OCR_REQUEST_TIMEOUT_MS,
      signal
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw networkError(detailFromError(error));
  }

  if (response.status < 200 || response.status > 299) {
    throw await buildHttpError(response);
  }

  return true;
}

/** Reads the current access token from the shared Supabase session. */
export async function readOcrAccessToken(): Promise<string | null> {
  try {
    const { supabase } = await import('../lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export { isAbortError };
