// src/ocr/telemetryProps.ts
// ============================================
// OCR v1 - Closed telemetry property allowlist
// ============================================
//
// Import-free on purpose: this is the privacy guard of the OCR telemetry
// (definitive PRD §70, §96, §97) and must be testable in isolation.
//
// Telemetry carries ids, enums, flags and counters ONLY. Never an amount, a
// product description, a merchant, ticket text, an image, card digits or free
// text. Anything not listed below is dropped before it reaches the service, so a
// careless call site cannot leak ticket content by adding a property.

/** Allowed telemetry properties (PRD §70). */
export interface OcrTelemetryProps {
  job_id?: string;
  status?: string;
  stage?: string;
  error_code?: string;
  file_count?: number;
  item_count?: number;
  issue_count?: number;
  group_count?: number;
  changed_item_count?: number;
  quarantine_age_ms?: number;
  duplicate?: boolean;
  memory_synced?: boolean;
}

/** The closed list. Adding a key here is a privacy decision, not a convenience. */
export const OCR_TELEMETRY_PROPERTY_KEYS: readonly (keyof OcrTelemetryProps)[] = [
  'job_id',
  'status',
  'stage',
  'error_code',
  'file_count',
  'item_count',
  'issue_count',
  'group_count',
  'changed_item_count',
  'quarantine_age_ms',
  'duplicate',
  'memory_synced',
];

/** Keeps only allowlisted, defined, scalar properties. */
export function sanitizeOcrTelemetryProps(
  props: Record<string, unknown> | OcrTelemetryProps | undefined
): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const key of OCR_TELEMETRY_PROPERTY_KEYS) {
    const value = (props as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
