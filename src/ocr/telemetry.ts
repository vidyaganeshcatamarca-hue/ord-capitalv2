// src/ocr/telemetry.ts
// ============================================
// OCR v1 - Frontend telemetry with a closed property allowlist
// ============================================
//
// Normative source: definitive PRD §69-§74, §96, §97, §115.
//
// The whole point of this module is what it REFUSES to send. Telemetry carries
// ids, enums, flags and counters only; never an amount, a product description,
// a merchant, ticket text, an image, or free-form error text. The allowlist is
// enforced here so a careless call site cannot leak ticket content by adding a
// property: anything not listed is dropped before `telemetry.track`.
//
// Nothing here emits an event per poll (PRD §69, §115.2).

import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry';
import type { OcrTelemetryStage } from './errors';
import { sanitizeOcrTelemetryProps, type OcrTelemetryProps } from './telemetryProps';

/** The OCR event names. Never mixed with `voice_*` (PRD §71). */
export const OCR_EVENTS = {
  uploadStarted: 'ocr_upload_started',
  uploadAccepted: 'ocr_upload_accepted',
  quarantineOpened: 'ocr_quarantine_opened',
  quarantineSaved: 'ocr_quarantine_saved',
  categoryCorrected: 'ocr_category_corrected',
  ticketConfirmed: 'ocr_ticket_confirmed',
  ticketRejected: 'ocr_ticket_rejected',
  frontendError: 'ocr_frontend_error',
} as const;

export type OcrEventName = (typeof OCR_EVENTS)[keyof typeof OCR_EVENTS];

export {
  OCR_TELEMETRY_PROPERTY_KEYS,
  sanitizeOcrTelemetryProps,
  type OcrTelemetryProps,
} from './telemetryProps';

/** Tracks one OCR event. Never throws, never blocks. */
export function trackOcrEvent(
  name: OcrEventName,
  props?: OcrTelemetryProps,
  priority: number = TELEMETRY_PRIORITY.MEDIUM
): void {
  try {
    telemetry.track(name, sanitizeOcrTelemetryProps(props), priority);
  } catch {
    // Telemetry must never break a financial flow.
  }
}

/**
 * Reports one frontend failure by STAGE + CODE only (PRD §74).
 * The raw `error.message` is intentionally not accepted as a parameter.
 */
export function trackOcrError(
  stage: OcrTelemetryStage,
  errorCode: string,
  props?: OcrTelemetryProps
): void {
  trackOcrEvent(
    OCR_EVENTS.frontendError,
    { ...props, stage, error_code: errorCode },
    TELEMETRY_PRIORITY.HIGH
  );
}
