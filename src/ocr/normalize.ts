// src/ocr/normalize.ts
// ============================================
// OCR v1 - Defensive normalizer from backend result to OcrTicket
// ============================================
//
// The integration contract (docs/OCR, v1) fixes the transport and the states
// but not the exact JSON field names of a result. The definitive PRD §50 fixes
// the CONCEPTS the quarantine must keep, so this normalizer accepts the
// documented concept names plus the obvious aliases and never invents data:
// a missing value stays null, and the verbatim result is preserved for
// traceability (`raw_result` -> `metadata.original_result`).
//
// Anything the backend sends that this file cannot map is NOT lost: it stays in
// `raw_result`. If a real field turns out to be named differently, only this
// file changes (PRD §127: document the endpoint, the real request/response, the
// difference and the impact instead of touching the OCR backend).

import type { OcrDiscount, OcrIssue, OcrItem, OcrPayment, OcrTicket } from './types';

/** Current version of the quarantine metadata contract (PRD §50). */
export const OCR_SCHEMA_VERSION = 1;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstDefined(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** Finite number from a number or numeric string; null otherwise. */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** ISO-4217 normalization: uppercase and trimmed, never a guessed currency. */
export function normalizeCurrencyCode(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const code = raw.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Local `YYYY-MM-DD` from an ISO date/datetime; null when unparseable. */
export function normalizeDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Ids may arrive as string or number; always normalized to a non-empty string. */
export function normalizeId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const raw = text(value);
  return raw;
}

/** Reads `{ id }` or a bare id from a category-ish value. */
function categoryId(value: unknown): string | null {
  const record = asRecord(value);
  if (record) return normalizeId(firstDefined(record, ['id', 'category_id', 'estructura_id']));
  return normalizeId(value);
}

function normalizeDiscounts(value: unknown): OcrDiscount[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const out: OcrDiscount[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    if (record) {
      const amount = num(firstDefined(record, ['amount', 'value', 'monto', 'importe']));
      if (amount === null) continue;
      out.push({
        label: text(firstDefined(record, ['label', 'name', 'description', 'nombre'])),
        // Magnitudes are positive everywhere: sign is an intent, not data.
        amount: Math.abs(amount),
      });
      continue;
    }
    const amount = num(entry);
    if (amount !== null) out.push({ label: null, amount: Math.abs(amount) });
  }
  return out;
}

function stringList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list
    .map((entry) => (typeof entry === 'string' ? entry : text(asRecord(entry)?.code)))
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function normalizeIssues(value: unknown): OcrIssue[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const out: OcrIssue[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      if (entry.trim().length > 0) {
        out.push({ code: entry.trim(), item_index: null, field: null });
      }
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const code = text(firstDefined(record, ['code', 'key', 'issue', 'type']));
    if (!code) continue;
    const itemIndex = num(firstDefined(record, ['item_index', 'index', 'line']));
    out.push({
      code,
      item_index: itemIndex === null ? null : Math.trunc(itemIndex),
      field: text(firstDefined(record, ['field', 'campo'])),
    });
  }
  return out;
}

/**
 * Payment source of the ticket. PRD §7: one payment source per ticket, so a
 * type is resolved once and applies to every generated movement.
 */
function normalizePayment(source: Record<string, unknown> | null, ticket: Record<string, unknown>): OcrPayment {
  const payment = source ?? {};
  const merged = { ...ticket, ...payment };
  const rawType = (text(firstDefined(merged, ['type', 'kind', 'tipo', 'payment_type'])) ?? '').toLowerCase();

  const cardId = num(firstDefined(merged, ['card_id', 'tarjeta_id']));
  const walletId = num(firstDefined(merged, ['wallet_id', 'billetera_id']));

  let type: OcrPayment['type'] = null;
  if (cardId !== null) type = 'card';
  else if (walletId !== null) type = 'wallet';
  else if (rawType.includes('card') || rawType.includes('tarjeta') || rawType.includes('credit')) type = 'card';
  else if (rawType.includes('wallet') || rawType.includes('billetera') || rawType.includes('cash') || rawType.includes('efectivo')) {
    type = 'wallet';
  }

  const installmentsRaw = num(firstDefined(merged, ['installments', 'cuotas', 'installment_count']));
  const installments = installmentsRaw === null ? null : Math.max(1, Math.trunc(installmentsRaw));

  return {
    type,
    wallet_id: walletId === null ? null : Math.trunc(walletId),
    card_id: cardId === null ? null : Math.trunc(cardId),
    installments,
    currency: normalizeCurrencyCode(firstDefined(merged, ['currency', 'moneda'])),
  };
}

function normalizeItems(value: unknown): OcrItem[] {
  const list = Array.isArray(value) ? value : [];
  const out: OcrItem[] = [];
  list.forEach((entry, position) => {
    const record = asRecord(entry);
    if (!record) return;

    const indexRaw = num(firstDefined(record, ['item_index', 'index', 'line_index', 'position']));
    const itemIndex = indexRaw === null ? position : Math.trunc(indexRaw);

    const quantity = num(firstDefined(record, ['quantity', 'qty', 'cantidad']));
    const unitPrice = num(firstDefined(record, ['unit_price', 'precio_unitario', 'price']));
    const printed = num(firstDefined(record, ['printed_amount', 'importe_impreso', 'amount', 'importe']));
    const discounts = normalizeDiscounts(firstDefined(record, ['discounts', 'descuentos', 'discount']));

    // PRD §14: `net_amount` is authoritative; quantity x unit price is only a
    // fallback when the backend did not send a final amount at all.
    const explicitNet = num(
      firstDefined(record, ['net_amount', 'net', 'final_amount', 'importe_final', 'line_total'])
    );
    const derivedFromPrinted =
      printed === null ? null : printed - discounts.reduce((sum, discount) => sum + discount.amount, 0);
    const derivedFromUnits = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
    const net = explicitNet ?? derivedFromPrinted ?? derivedFromUnits ?? 0;

    out.push({
      item_index: itemIndex,
      description: text(firstDefined(record, ['description', 'descripcion', 'raw_description', 'name', 'nombre'])) ?? '',
      quantity,
      unit_price: unitPrice,
      printed_amount: printed,
      discounts,
      net_amount: Math.round(net * 100) / 100,
      original_category_id: categoryId(
        firstDefined(record, ['original_category_id', 'expense_category_id', 'category_id', 'categoria_id', 'category'])
      ),
      current_category_id: categoryId(
        firstDefined(record, ['current_category_id', 'original_category_id', 'expense_category_id', 'category_id', 'categoria_id', 'category'])
      ),
      issues: stringList(firstDefined(record, ['issues', 'issue_codes'])),
    });
  });
  return out;
}

/**
 * Builds the normalized ticket from a backend result.
 * Returns null when there is nothing ticket-shaped to read.
 */
export function normalizeOcrResult(jobId: string, raw: unknown): OcrTicket | null {
  const record = asRecord(raw);
  if (!record) return null;

  const items = normalizeItems(firstDefined(record, ['items', 'lines', 'products', 'productos']));
  const payment = normalizePayment(
    asRecord(firstDefined(record, ['payment', 'payment_method', 'medio_pago', 'payment_source'])),
    record
  );

  const explicitTotal = num(firstDefined(record, ['total', 'total_amount', 'importe_total', 'grand_total']));
  const itemsTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
  const generalDiscount = Math.abs(
    num(firstDefined(record, ['general_discount', 'ticket_discount', 'descuento_general', 'discount'])) ?? 0
  );

  // A ticket without items and without a total is not a ticket: the caller
  // reports a malformed result instead of inventing an empty quarantine.
  if (items.length === 0 && explicitTotal === null) return null;

  const total = Math.round((explicitTotal ?? itemsTotal - generalDiscount) * 100) / 100;

  return {
    ocr_schema_version: OCR_SCHEMA_VERSION,
    ocr_job_id: jobId,
    merchant: text(firstDefined(record, ['merchant', 'merchant_name', 'store', 'comercio', 'issuer'])),
    purchase_date: normalizeDate(firstDefined(record, ['purchase_date', 'date', 'fecha', 'issued_at'])),
    currency:
      normalizeCurrencyCode(firstDefined(record, ['currency', 'moneda', 'local_currency'])) ??
      payment.currency,
    total,
    general_discount: Math.round(generalDiscount * 100) / 100,
    items,
    issues: normalizeIssues(firstDefined(record, ['issues', 'issue_codes', 'warnings'])),
    payment,
  };
}
