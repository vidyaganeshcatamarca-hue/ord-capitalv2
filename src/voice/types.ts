// src/voice/types.ts
// ============================================
// Voice v1 - Public type contracts
// ============================================

/**
 * Multipart context sent alongside an audio job so the backend can resolve
 * entity references (expense categories, wallets, cards, income sources) by
 * name instead of by id.
 */
export interface VoiceContext {
  local_datetime: string;
  local_date: string;
  timezone: string;
  local_currency: string;
  expense_categories: Array<{
    id: string; // string: bigint del backend, no convertir a number
    name: string;
    parent_name: string | null;
  }>;
  income_sources: Array<{
    id: string; // string: bigint del backend, no convertir a number
    name: string;
  }>;
  wallets: Array<{
    id: string; // string: bigint del backend, no convertir a number
    name: string;
    currency: string;
  }>;
  cards: Array<{
    id: string; // string: bigint del backend, no convertir a number
    name: string;
    supported_currencies: string[];
  }>;
}

/** Discriminator for the kind of financial movement detected in an audio job. */
export type VoiceMovementType = 'expense' | 'income' | 'transfer' | 'card_expense';

/**
 * A single financial movement resolved by the voice backend.
 * Entity fields expose both the resolved id and the human-readable name so the
 * UI can render and re-submit a movement without an extra lookup.
 */
export interface VoiceMovement {
  type: VoiceMovementType;
  amount: number | null;
  destination_amount: number | null;
  expense_category_id: string | null; // string: bigint del backend, no convertir a number
  source_wallet_id: string | null; // string: bigint del backend, no convertir a number
  destination_wallet_id: string | null; // string: bigint del backend, no convertir a number
  card_id: string | null; // string: bigint del backend, no convertir a number
  income_source_id: string | null; // string: bigint del backend, no convertir a number
  expense_category_name: string | null;
  source_wallet_name: string | null;
  destination_wallet_name: string | null;
  card_name: string | null;
  income_source_name: string | null;
  currency: string | null;
  installments: number | null;
  date: string | null;
  note: string | null;
  /** Present only when a spoken name matched more than one entity. */
  ambiguous_matches?: AmbiguousMatches;
}

/** A single candidate entity returned when a spoken name is ambiguous. */
export interface AmbiguousCandidate {
  id: string; // string: bigint del backend, no convertir a number
  name: string;
  parent_name: string | null;
}

/** Ambiguous candidates grouped by the entity kind that failed to resolve uniquely. */
export interface AmbiguousMatches {
  expense_category?: AmbiguousCandidate[];
  source_wallet?: AmbiguousCandidate[];
  destination_wallet?: AmbiguousCandidate[];
  card?: AmbiguousCandidate[];
  income_source?: AmbiguousCandidate[];
}

/** Lifecycle status of an asynchronous voice job. */
export type VoiceJobStatus = 'queued' | 'processing' | 'retry_wait' | 'completed' | 'terminal_failed';

/** Processing stage reported while an asynchronous voice job is in flight. */
export type VoiceJobStage = 'queued' | 'transcribing' | 'interpreting' | 'finalizing' | 'done';

/** Snapshot of an asynchronous voice job, including its result when completed. */
export interface VoiceJob {
  schema_version: number;
  job_id: string; // opaque backend job identifier (string)
  status: VoiceJobStatus;
  stage: VoiceJobStage;
  result_schema_version: number | null;
  result: { movements: VoiceMovement[] } | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  failed_at: string | null;
}

/** Response payload returned when a new voice job is enqueued. */
export interface VoiceJobCreate {
  schema_version: number;
  job_id: string; // opaque backend job identifier (string)
  status: 'queued';
  stage: 'queued';
  reused: boolean;
}

/** Error envelope returned by the voice backend on failure. */
export interface VoiceErrorEnvelope {
  schema_version: number;
  status: 'error';
  error: { code: string; message: string };
}
