// src/ocr/contract.ts
// ============================================
// OCR v1 - HTTP contract, upload limits and request builders
// ============================================
//
// Normative source: docs/OCR/propuesta contrato back-front.md §3-§5 and the
// definitive PRD §26-§27, §106.
//
// Deliberately independent from `src/voice/contract.ts`: the two integrations
// share the API host, not the semantics (PRD §78). Nothing here reads or writes
// Voice keys, and the multipart below never carries an `idempotency_key`.

/** Base URL of the OCR backend (same API host as Voice, per contract v1). */
export const OCR_API_BASE_URL = 'https://ocr-api.ordcapital.app' as const;

/** Enqueue path for a new ticket (contract v1 §3). */
export const OCR_JOB_CREATE_PATH = '/v1/ocr/jobs' as const;

/** Polling path for a previously created job (contract v1 §7). */
export const OCR_JOB_POLL_PATH = (jobId: string): string =>
  `/v1/ocr/jobs/${encodeURIComponent(jobId)}`;

/** Category-memory path bound to one job (PRD §22). */
export const OCR_CATEGORY_MEMORY_PATH = (jobId: string): string =>
  `/v1/ocr/jobs/${encodeURIComponent(jobId)}/category-memory`;

/** Maximum number of images accepted for a single ticket (PRD §27). */
export const MAX_OCR_IMAGES = 10;

/** Maximum size of a single file: 20 MB (PRD §27). */
export const MAX_OCR_FILE_BYTES = 20 * 1024 * 1024;

/** Maximum size of the whole ticket: 80 MB (PRD §27). */
export const MAX_OCR_TOTAL_BYTES = 80 * 1024 * 1024;

/** Accepted image MIME types. */
export const OCR_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** Accepted PDF MIME type. */
export const OCR_PDF_MIME_TYPE = 'application/pdf';

/** Extensions accepted as a fallback when the browser reports no MIME type. */
const IMAGE_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp'];
const PDF_EXTENSIONS: readonly string[] = ['pdf'];

/** Serializable shape of a file, so validation is testable without a DOM. */
export interface OcrFileLike {
  name?: string;
  type?: string;
  size: number;
}

/** Why a set of files cannot be uploaded. Every reason maps to an i18n key. */
export type OcrFileRejection =
  | 'no_files'
  | 'too_many_images'
  | 'mixed_types'
  | 'unsupported_format'
  | 'file_too_big'
  | 'total_too_big';

/** Result of the pre-POST validation (PRD §27, criteria §106). */
export type OcrFileValidationResult = { ok: true } | { ok: false; reason: OcrFileRejection };

function extensionOf(name: string | undefined): string {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** True when the browser reports an accepted image type or image extension. */
export function isOcrImageFile(file: OcrFileLike): boolean {
  const type = (file.type ?? '').toLowerCase();
  if (OCR_IMAGE_MIME_TYPES.includes(type)) return true;
  // Some Android webviews send an empty type for camera captures.
  if (type !== '') return false;
  return IMAGE_EXTENSIONS.includes(extensionOf(file.name));
}

/** True when the file is a PDF by MIME type or extension. */
export function isOcrPdfFile(file: OcrFileLike): boolean {
  const type = (file.type ?? '').toLowerCase();
  if (type === OCR_PDF_MIME_TYPE) return true;
  if (type !== '') return false;
  return PDF_EXTENSIONS.includes(extensionOf(file.name));
}

/** True when the file is neither an accepted image nor a PDF. */
export function isOcrUnsupportedFile(file: OcrFileLike): boolean {
  return !isOcrImageFile(file) && !isOcrPdfFile(file);
}

/**
 * Validates the ticket files BEFORE the POST, exactly in the order the product
 * cares about: composition first (a mixed or oversized batch is a different
 * mistake than a wrong format), then per-file limits, then the total.
 *
 * Rules (PRD §27):
 *   - 1 to 10 images, or exactly 1 PDF;
 *   - never a PDF mixed with images;
 *   - JPEG/PNG/WebP/PDF only;
 *   - 20 MB per file, 80 MB total.
 */
export function validateOcrFiles(files: readonly OcrFileLike[]): OcrFileValidationResult {
  if (files.length === 0) return { ok: false, reason: 'no_files' };

  const pdfCount = files.filter(isOcrPdfFile).length;
  const imageCount = files.length - pdfCount;

  // A PDF is a whole ticket on its own: any other file turns the batch mixed.
  if (pdfCount > 0 && files.length > 1) return { ok: false, reason: 'mixed_types' };
  if (imageCount > MAX_OCR_IMAGES) return { ok: false, reason: 'too_many_images' };

  if (files.some(isOcrUnsupportedFile)) return { ok: false, reason: 'unsupported_format' };

  if (files.some((file) => file.size > MAX_OCR_FILE_BYTES)) {
    return { ok: false, reason: 'file_too_big' };
  }

  const totalBytes = files.reduce((sum, file) => sum + Math.max(0, file.size), 0);
  if (totalBytes > MAX_OCR_TOTAL_BYTES) return { ok: false, reason: 'total_too_big' };

  return { ok: true };
}

/** Input required to build the multipart body of a ticket upload. */
export interface BuildOcrJobFormDataInput {
  files: readonly File[];
  /** ORD snapshot built by `buildOcrContext` (contract v1 §4). */
  context: unknown;
}

/**
 * Builds the `multipart/form-data` body: repeated `files` parts plus one
 * serialized `context` field (contract v1 §3, PRD §26).
 */
export function buildOcrJobFormData(input: BuildOcrJobFormDataInput): FormData {
  const { files, context } = input;
  const formData = new FormData();
  for (const file of files) {
    // The original filename is never identity (PRD §43); it is only a hint for
    // the backend's own logging, so an unnamed blob still gets a stable name.
    formData.append('files', file, file.name || 'ticket');
  }
  formData.append('context', JSON.stringify(context));
  return formData;
}

/** Local `YYYY-MM-DD` string, built from local components on purpose. */
export function toLocalDateString(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Extracts `{ code }` from an unknown JSON error body, with a safe fallback. */
export function parseOcrErrorResponse(json: unknown): { code: string; message: string } {
  if (typeof json !== 'object' || json === null) return { code: 'UNKNOWN', message: '' };
  const envelope = json as Record<string, unknown>;
  const error = envelope.error;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string' && record.code.length > 0) {
      return { code: record.code, message: typeof record.message === 'string' ? record.message : '' };
    }
  }
  if (typeof envelope.message_code === 'string' && envelope.message_code.length > 0) {
    return { code: envelope.message_code, message: '' };
  }
  return { code: 'UNKNOWN', message: '' };
}

/** Maps an HTTP status to the closest contract error code. */
export function ocrErrorCodeFromHttpStatus(status: number): string {
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
      return 'FILE_LIMIT_EXCEEDED';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
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
