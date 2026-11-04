// src/ocr/quarantine.ts
// ============================================
// OCR v1 - Quarantine RPC client (frontend -> RPC only)
// ============================================
//
// Normative source: definitive PRD §47, §48, §50, §52, §53, §58, §59, §104.
//
// The OCR backend never writes Supabase; the frontend persists through these
// RPCs, exactly like the Voice flow. Every write goes through an RPC — no
// component ever touches a table (§104).
//
// Idempotency is enforced in TWO places on purpose (§52, §123): this client
// keeps a dispatch guard, and the RPC itself must return the existing row for a
// repeated `ocr_job_id` under concurrency.

import { rpc } from '@/lib/supabase';
import { OCR_SCHEMA_VERSION } from './normalize';
import type { OcrIssue, OcrItem, OcrPayment, OcrTicket } from './types';

/** Ticket payload persisted in `p_caja_cuarentena.metadata` (PRD §50, §53). */
export interface OcrQuarantineTicketPayload {
  ocr_schema_version: number;
  ocr_job_id: string;
  merchant: string | null;
  purchase_date: string | null;
  currency: string | null;
  total: number;
  general_discount: number;
  issues: OcrIssue[];
  items: OcrItem[];
  payment: OcrPayment;
}

/**
 * Serializes a ticket for the quarantine.
 * `saved_category_id` is initialized to the backend proposal so the very first
 * Save knows which categories are real corrections (PRD §19 case C).
 */
export function toQuarantineTicketPayload(ticket: OcrTicket): OcrQuarantineTicketPayload {
  return {
    ocr_schema_version: ticket.ocr_schema_version || OCR_SCHEMA_VERSION,
    ocr_job_id: ticket.ocr_job_id,
    merchant: ticket.merchant,
    purchase_date: ticket.purchase_date,
    currency: ticket.currency,
    total: ticket.total,
    general_discount: ticket.general_discount,
    issues: ticket.issues,
    items: ticket.items.map((item) => ({
      ...item,
      saved_category_id:
        item.saved_category_id !== undefined && item.saved_category_id !== null
          ? item.saved_category_id
          : item.original_category_id,
    })),
    payment: ticket.payment,
  };
}

/** Row returned by `fn_cargar_ticket_ocr_cuarentena`. */
export interface OcrQuarantineLoadRow {
  pendiente_id: number;
  created: boolean;
  estado: string;
}

export interface LoadOcrQuarantineInput {
  jobId: string;
  ticket: OcrTicket;
  /** Verbatim backend result, kept as evidence (never re-derived). */
  originalResult: unknown;
}

/**
 * Lands a finished job in the quarantine. Repeated calls for the same
 * `ocr_job_id` resolve to the SAME `pendiente_id` with `created = false`.
 */
export async function loadOcrQuarantine(input: LoadOcrQuarantineInput): Promise<OcrQuarantineLoadRow> {
  const { jobId, ticket, originalResult } = input;
  const rows = await rpc<OcrQuarantineLoadRow[]>('fn_cargar_ticket_ocr_cuarentena', {
    p_job_id: jobId,
    p_ticket: toQuarantineTicketPayload(ticket),
    p_original_result: originalResult ?? null,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.pendiente_id == null) {
    throw new Error('ocr_quarantine_load_failed');
  }
  return {
    pendiente_id: Number(row.pendiente_id),
    created: row.created === true,
    estado: typeof row.estado === 'string' ? row.estado : 'pendiente',
  };
}

/** Persists the corrected draft. Never creates a movement (PRD §17). */
export async function saveOcrQuarantine(
  pendienteId: number,
  ticket: OcrTicket
): Promise<void> {
  await rpc('fn_guardar_ticket_ocr_cuarentena', {
    p_pendiente_id: pendienteId,
    p_ticket: toQuarantineTicketPayload(ticket),
  });
}

/** One movement created by the grouped confirmation. */
export interface OcrConfirmGroupRow {
  grupo_orden: number;
  estructura_egreso_id: number;
  monto: number;
  p_caja_id: number | null;
}

/**
 * Confirms the ticket: one movement per final category node, in a single
 * transaction (PRD §58). A partial success is impossible by construction; the
 * RPC either returns every group or raises.
 */
export async function confirmOcrQuarantine(pendienteId: number): Promise<OcrConfirmGroupRow[]> {
  const rows = await rpc<OcrConfirmGroupRow[]>('fn_confirmar_ticket_ocr_cuarentena', {
    p_pendiente_id: pendienteId,
  });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Rejects the ticket. Reuses the existing quarantine RPC because its semantics
 * already match OCR (PRD §48: "El rechazo puede reutilizar la RPC existente si
 * resulta compatible"): it deletes the pending row of the current user and
 * creates nothing.
 */
export async function rejectOcrQuarantine(pendienteId: number): Promise<void> {
  await rpc('fn_rechazar_cuarentena', { p_pendiente_id: pendienteId });
}
