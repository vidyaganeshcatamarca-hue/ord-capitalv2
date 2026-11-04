// src/ocr/errors.ts
// ============================================
// OCR v1 - Stable codes to i18n keys
// ============================================
//
// PRD §98: the UI maps known codes to i18n and telemetry carries the CODE, never
// free text. Nothing here interpolates ticket content into a message.

import type { OcrFileRejection } from './contract';

/** Backend/transport code -> i18n key. */
const CODE_TO_I18N_KEY: Record<string, string> = {
  NETWORK: 'ocr.error_network',
  UNAUTHORIZED: 'ocr.error_unauthorized',
  FORBIDDEN: 'ocr.error_unauthorized',
  NOT_FOUND: 'ocr.error_job_not_found',
  FILE_LIMIT_EXCEEDED: 'ocr.error_file_too_big',
  UNSUPPORTED_MEDIA_TYPE: 'ocr.error_unsupported_format',
  BAD_REQUEST: 'ocr.error_upload_failed',
  INVALID_REQUEST: 'ocr.error_upload_failed',
  CONFLICT: 'ocr.error_upload_failed',
  RATE_LIMITED: 'ocr.error_upload_failed',
  INTERNAL_ERROR: 'ocr.error_upload_failed',
  SERVICE_UNAVAILABLE: 'ocr.error_upload_failed',
  CONTEXT_UNAVAILABLE: 'ocr.error_context_unavailable',
  STORAGE_UNAVAILABLE: 'ocr.storage_unavailable',
};

/** i18n key for a transport/backend error code. */
export function ocrErrorI18nKey(code: string | null | undefined): string {
  if (!code) return 'ocr.error_unknown';
  return CODE_TO_I18N_KEY[code] ?? 'ocr.error_unknown';
}

/**
 * i18n key for an UPLOAD failure.
 *
 * A 404 during upload means the endpoint is not published where the client is
 * pointing, not that a job vanished: telling the user "we could not find this
 * ticket on the server" is nonsense right after choosing a file (verified
 * against the real backend: `POST /v1/ocr/jobs` answers 404 while Voice answers
 * 401 on the same host). The generic upload message is the honest one.
 */
export function ocrUploadErrorI18nKey(code: string | null | undefined): string {
  if (!code) return 'ocr.error_upload_failed';
  if (code === 'NOT_FOUND') return 'ocr.error_upload_failed';
  return ocrErrorI18nKey(code);
}

/** i18n key for a local file-validation rejection (PRD §27). */
const REJECTION_TO_I18N_KEY: Record<OcrFileRejection, string> = {
  no_files: 'ocr.error_no_files',
  too_many_images: 'ocr.error_too_many_images',
  mixed_types: 'ocr.error_mixed_types',
  unsupported_format: 'ocr.error_unsupported_format',
  file_too_big: 'ocr.error_file_too_big',
  total_too_big: 'ocr.error_total_too_big',
};

export function ocrFileRejectionI18nKey(reason: OcrFileRejection): string {
  return REJECTION_TO_I18N_KEY[reason] ?? 'ocr.error_unknown';
}

/**
 * Telemetry stages (PRD §74). Kept as a closed union so a typo cannot invent a
 * new dashboard dimension.
 */
export type OcrTelemetryStage =
  | 'upload'
  | 'local_image_store'
  | 'polling'
  | 'quarantine_dispatch'
  | 'quarantine_save'
  | 'memory_sync'
  | 'confirmation'
  | 'local_cache';
