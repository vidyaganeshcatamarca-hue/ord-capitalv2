// src/ocr/contextTypes.ts
// ============================================
// OCR v1 - Shape of the ORD snapshot sent with a ticket
// ============================================
//
// Kept in its own module so `contract.ts` (pure, DOM-free) and the UI can both
// import the type without pulling React in through the context builder.

/** Language tag sent by default when the app language is not resolved. */
export const DEFAULT_OCR_LANGUAGE = 'es' as const;

/** Fallback currency when neither the region nor a wallet can be resolved. */
export const DEFAULT_OCR_LOCAL_CURRENCY = 'ARS' as const;

/**
 * One selectable final category node (definitive PRD §29).
 * `parent_name` is null for a root node: the selectable id is always the id of
 * the node itself, never the parent.
 */
export interface OcrCatalogCategory {
  id: string;
  name: string;
  parent_name: string | null;
}

export interface OcrCatalogWallet {
  id: string;
  name: string;
  currency: string;
}

/**
 * A card declares its supported currencies (definitive PRD §31). The frontend
 * adapts `moneda_iso` into this list; the OCR backend contract is unchanged.
 */
export interface OcrCatalogCard {
  id: string;
  name: string;
  supported_currencies: string[];
}

/** Serialized `context` field of `POST /v1/ocr/jobs` (contract v1 §4). */
export interface OcrContext {
  language: string;
  local_datetime: string;
  local_date: string;
  timezone: string;
  local_currency: string;
  expense_categories: OcrCatalogCategory[];
  wallets: OcrCatalogWallet[];
  cards: OcrCatalogCard[];
}

/**
 * PRD §31: the app exposes a single `moneda_iso` per card, while the OCR
 * contract expects `supported_currencies[]`. The frontend adapts; the OCR
 * backend is never touched for this difference. An empty/invalid code yields an
 * empty list instead of a guessed currency.
 */
export function cardSupportedCurrencies(monedaIso: string | null | undefined): string[] {
  const code = typeof monedaIso === 'string' ? monedaIso.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(code) ? [code] : [];
}

/** Size the context is expected to stay under, mirroring the Voice contract. */
export const MAX_OCR_CONTEXT_BYTES = 512 * 1024;

/** True when the serialized context fits the accepted payload size. */
export function isOcrContextWithinBudget(context: OcrContext): boolean {
  try {
    return JSON.stringify(context).length <= MAX_OCR_CONTEXT_BYTES;
  } catch {
    return false;
  }
}
