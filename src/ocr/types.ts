// src/ocr/types.ts
// ============================================
// OCR v1 - Domain types shared by client, storage, grouping and UI
// ============================================
//
// Normative source: docs/OCR/prd-ocr-final.md (definitive OCR PRD) plus the
// integration contract docs/OCR/propuesta contrato back-front.md v1.
//
// Vocabulary deliberately kept apart from Voice:
//   Voice  -> metadata.job_id      (never reused here)
//   OCR    -> metadata.ocr_job_id
// A single ticket is ONE quarantine row (PRD §2) whose `metadata.items[]`
// holds every product; groups are derived data, never a second source of
// truth (PRD §54).

/** The eight backend job states (PRD §35). All of them have i18n. */
export type OcrJobStatus =
  | 'queued'
  | 'processing'
  | 'waiting_for_inference'
  | 'classifying'
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'cancelled';

/** States after which polling stops. */
export const OCR_TERMINAL_STATUSES: readonly OcrJobStatus[] = [
  'completed',
  'needs_review',
  'failed',
  'cancelled',
];

/** States whose result must land in the quarantine (PRD §55). */
export const OCR_DISPATCH_STATUSES: readonly OcrJobStatus[] = ['completed', 'needs_review'];

/** True when the status ends the polling loop. */
export function isOcrTerminalStatus(status: OcrJobStatus): boolean {
  return OCR_TERMINAL_STATUSES.includes(status);
}

/** True when a terminal status carries a result to dispatch. */
export function isOcrDispatchStatus(status: OcrJobStatus): boolean {
  return OCR_DISPATCH_STATUSES.includes(status);
}

/** A discount line read from the ticket. `amount` is a positive magnitude. */
export interface OcrDiscount {
  label: string | null;
  amount: number;
}

/**
 * One product of the ticket.
 *
 * `description` is immutable evidence of what the OCR read (PRD §15): the user
 * expresses interpretation through the category, never by editing this field.
 * `net_amount` is the authoritative financial amount (PRD §14); quantity and
 * unit price are auxiliary and never overwrite it.
 */
export interface OcrItem {
  item_index: number;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  printed_amount: number | null;
  discounts: OcrDiscount[];
  net_amount: number;
  /** Category proposed by the backend, kept for traceability (PRD §53). */
  original_category_id: string | null;
  /** Category the user currently assigned in the quarantine. */
  current_category_id: string | null;
  /**
   * Category the user last persisted. Used to count a REAL correction only once
   * (PRD §20, §110.10): saving twice without changes must not append memory.
   * Initialized to the backend proposal at dispatch time.
   */
  saved_category_id?: string | null;
  /** Item-scoped issue codes declared by the backend (PRD §37). */
  issues: string[];
}

/** Payment method resolved for the whole ticket (PRD §7, one per ticket). */
export interface OcrPayment {
  type: 'wallet' | 'card' | null;
  wallet_id: number | null;
  card_id: number | null;
  installments: number | null;
  currency: string | null;
}

/** Backend-declared issue used to guide the review (PRD §37, §56). */
export interface OcrIssue {
  code: string;
  item_index: number | null;
  field: string | null;
}

/** Normalized ticket produced from a backend result. */
export interface OcrTicket {
  ocr_schema_version: number;
  ocr_job_id: string;
  merchant: string | null;
  /** Local `YYYY-MM-DD`, or null when the backend could not read it. */
  purchase_date: string | null;
  /** ISO-4217 code, normalized uppercase, or null. */
  currency: string | null;
  total: number;
  /** Ticket-level discount distributed proportionally (PRD §12). */
  general_discount: number;
  items: OcrItem[];
  issues: OcrIssue[];
  payment: OcrPayment;
}

/** Result of a polling GET. */
export interface OcrJob {
  job_id: string;
  status: OcrJobStatus;
  /**
   * Finer backend phase inside `processing` (for example `extracting`).
   *
   * Read defensively on purpose: the integration contract lists only the eight
   * statuses, so a backend that does not send it must keep working. When it is
   * absent the UI falls back to the status alone; nothing is inferred from it.
   */
  stage: string | null;
  /** Backend-declared issues for the whole ticket. */
  issues: OcrIssue[];
  /** Normalized ticket, present only for `completed`/`needs_review`. */
  ticket: OcrTicket | null;
  /** Verbatim backend result, kept in the quarantine for traceability. */
  raw_result: unknown;
  error_code: string | null;
  message_code: string | null;
  created_at: string;
  updated_at: string;
}

/** Acceptance envelope of `POST /v1/ocr/jobs` (contract v1 §5). */
export interface OcrJobAccepted {
  job_id: string;
  accepted: boolean;
  upload_complete: boolean;
  duplicate: boolean;
  status: OcrJobStatus;
  processing_pending: boolean;
  should_upload_again: boolean;
  message_code: string | null;
}

/** One local image blob reference of a ticket (PRD §43). */
export interface OcrImageManifestEntry {
  job_id: string;
  file_index: number;
  mime_type: string;
  created_at: string;
  /** Set when the backend finished processing the ticket (PRD §44). */
  processed_at: string | null;
  /** `processed_at + 7 days`; null while the job is still pending. */
  expires_at: string | null;
}
