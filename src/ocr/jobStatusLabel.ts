// src/ocr/jobStatusLabel.ts
// ============================================
// OCR - how a job's real backend state reads to the owner
// ============================================
//
// A ticket with four photos can take minutes, and "Procesando" for ten minutes
// tells the owner nothing. This maps the state the backend actually reported to
// one short line, and nothing else.
//
// Rules honoured here:
//   - no internal vocabulary: no Spark, no model names, no worker, lease, n8n or
//     inference. The owner reads what is happening, not how it is built;
//   - no invented progress: there is no percentage, no ETA and no step count,
//     because the backend does not report any;
//   - `stage` is optional. The integration contract publishes only the eight
//     statuses, so a backend that omits `stage` still gets a correct line;
//   - `failed` and `cancelled` keep the wording the app already uses.

import type { OcrJobStatus } from './types';

/** Visual weight of a state, used only to pick a colour. */
export type OcrJobTone = 'neutral' | 'active' | 'ready' | 'error';

export interface OcrJobStatusDisplay {
  /** i18n key under `ocr.*`. */
  key: string;
  tone: OcrJobTone;
}

/**
 * One owner-facing line for a backend state, or null when there is nothing to
 * say yet (no status received).
 *
 * `stage` is accepted because the backend may send a finer phase inside
 * `processing`; today the only documented one is `extracting`, which reads the
 * same as `processing`. Anything unknown falls back to the status, never to a
 * guess.
 */
export function describeOcrJobStatus(
  status: OcrJobStatus | null,
  stage: string | null = null
): OcrJobStatusDisplay | null {
  if (!status) return null;
  switch (status) {
    case 'queued':
      return { key: 'ocr.job_status_received', tone: 'neutral' };
    case 'processing':
    case 'waiting_for_inference':
      // `extracting` and any other stage inside processing still mean "reading".
      return status === 'processing'
        ? { key: 'ocr.job_status_reading', tone: 'active' }
        : { key: 'ocr.job_status_waiting', tone: 'neutral' };
    case 'classifying':
      return { key: 'ocr.job_status_classifying', tone: 'active' };
    case 'completed':
    case 'needs_review':
      return { key: 'ocr.job_status_ready', tone: 'ready' };
    case 'failed':
      return { key: 'ocr.status_failed', tone: 'error' };
    case 'cancelled':
      return { key: 'ocr.status_cancelled', tone: 'error' };
    default:
      return null;
  }
}
