// src/ocr/grouping.ts
// ============================================
// OCR v1 - Financial grouping, proportional discounts and cent-exact closure
// ============================================
//
// Normative source: definitive PRD §3, §6, §11, §12, §13, §54, §87, §88, §89.
//
// Two rules drive every decision here:
//
//   1. One movement per FINAL category node, never one per product (§3), and
//      groups are DERIVED from the items — never a separate editable source
//      that could diverge (§54).
//   2. The sum of the confirmed movements must equal the ticket total (§13),
//      using decimal arithmetic, never binary floats. Every amount therefore
//      travels as integer cents and only becomes a decimal number at the edge.
//
// Rounding residue is compensated deterministically on the group with the
// largest subtotal. A materially wrong ticket is NEVER silently "fixed": it is
// flagged so the UI asks for a human decision (§89).

/** Category key used for items without a valid category (PRD §8). */
export const OCR_UNRECOGNIZED_KEY = 'ocr_unrecognized' as const;

/**
 * Largest residue that is still attributable to rounding, in cents.
 * PRD §13 allows ±0,01 / ±0,02 "etc."; anything above this is material (§89)
 * and must be resolved by the user before confirming.
 */
export const ROUNDING_TOLERANCE_CENTS = 5;

/**
 * Converts a decimal amount to integer cents (half away from zero).
 *
 * Implemented through the exponent-shifted decimal STRING, not by multiplying:
 * `1.005 * 100` is `100.49999999999999` in binary, so a plain multiply-then-round
 * would turn 1.005 into 1.00 and silently lose a cent. Parsing `"1.005e2"` gives
 * the exact 100.5 the user typed, so half-up behaves as expected.
 */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Number(`${value}e2`);
  if (!Number.isFinite(scaled)) return 0;
  // Symmetric rounding: -1.005 -> -101, not -100.
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Converts integer cents back to a decimal amount. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Minimal item shape the grouping needs; keeps the module UI-independent. */
export interface GroupingItem {
  item_index: number;
  /** Authoritative financial amount of the product (PRD §14). */
  net_amount: number;
  /** Final category node id as string, or null when unrecognized. */
  category_key: string | null;
}

/** One financial group: a final category node and its products. */
export interface OcrCategoryGroup {
  /** Final category id as string, or `ocr_unrecognized`. */
  category_key: string;
  item_indexes: number[];
  /** Sum of the product net amounts, in cents. */
  subtotal_cents: number;
  /** Proportional share of the ticket-level discount, in cents. */
  general_discount_cents: number;
  /** Final amount of the group, in cents (subtotal - discount + residue). */
  total_cents: number;
  subtotal: number;
  general_discount: number;
  total: number;
  /** True for the fallback bucket of unrecognized products. */
  unrecognized: boolean;
}

/** Result of grouping a ticket. */
export interface OcrGroupingResult {
  groups: OcrCategoryGroup[];
  subtotal_cents: number;
  general_discount_cents: number;
  /** Sum of group totals before the residue compensation. */
  sum_before_residue_cents: number;
  /** Sum of group totals after the residue compensation. */
  sum_cents: number;
  /** Ticket total the closure is measured against, in cents. */
  ticket_total_cents: number;
  /** Signed amount moved to the largest group to close the ticket. */
  rounding_adjustment_cents: number;
  /**
   * True when the difference is too large to be rounding: confirming would
   * invent money, so the UI must ask the user to fix the amounts (§89).
   */
  material_mismatch: boolean;
  /** Difference that could not be compensated (0 unless material). */
  unresolved_cents: number;
}

export interface ComputeGroupsInput {
  items: readonly GroupingItem[];
  /** Ticket-level discount magnitude (positive). */
  general_discount?: number | null;
  /** Ticket total, or null when the backend did not read one. */
  ticket_total?: number | null;
}

interface Draft {
  categoryKey: string;
  itemIndexes: number[];
  subtotalCents: number;
  discountCents: number;
  order: number;
}

/**
 * Distributes `discountCents` proportionally over the group subtotals using the
 * largest-remainder method, so the distributed cents add up EXACTLY to the
 * discount: `descuento_grupo = descuento_general × subtotal_grupo / subtotal`
 * (PRD §12) without a single lost cent.
 */
function distributeDiscount(drafts: readonly Draft[], discountCents: number, totalCents: number): number[] {
  if (discountCents <= 0 || totalCents <= 0) return drafts.map(() => 0);

  const shares: number[] = [];
  const remainders: { index: number; remainder: number; subtotal: number }[] = [];
  let distributed = 0;

  drafts.forEach((draft, index) => {
    const numerator = discountCents * draft.subtotalCents;
    const base = Math.floor(numerator / totalCents);
    shares.push(base);
    distributed += base;
    remainders.push({ index, remainder: numerator % totalCents, subtotal: draft.subtotalCents });
  });

  let leftover = discountCents - distributed;
  if (leftover > 0) {
    // Deterministic tie-break: bigger remainder first, then bigger subtotal,
    // then the original ticket order.
    remainders.sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      if (b.subtotal !== a.subtotal) return b.subtotal - a.subtotal;
      return a.index - b.index;
    });
    let cursor = 0;
    while (leftover > 0 && remainders.length > 0) {
      const target = remainders[cursor % remainders.length];
      shares[target.index] += 1;
      leftover -= 1;
      cursor += 1;
    }
  }

  return shares;
}

/** Index of the group that absorbs the rounding residue (largest subtotal). */
function largestGroupIndex(drafts: readonly Draft[]): number {
  let best = 0;
  for (let index = 1; index < drafts.length; index += 1) {
    if (drafts[index].subtotalCents > drafts[best].subtotalCents) best = index;
  }
  return best;
}

/**
 * Groups the ticket items by final category node and closes the ticket total.
 *
 * Guarantees, in order:
 *   - products with the same category form ONE group (§3, criteria §109.1);
 *   - a group subtotal is the sum of its product net amounts (§109.2);
 *   - product discounts already live inside `net_amount`, so they are never
 *     redistributed (§11);
 *   - the general discount is proportional (§12);
 *   - amounts are cent-exact and the residue lands on the largest group (§13);
 *   - a material difference is reported, never absorbed (§89).
 */
export function computeTicketGroups(input: ComputeGroupsInput): OcrGroupingResult {
  const { items } = input;
  const ticketDiscount = Math.abs(input.general_discount ?? 0);

  const byKey = new Map<string, Draft>();
  let order = 0;

  for (const item of items) {
    const cents = toCents(item.net_amount);
    // PRD §87: a product whose final amount is zero never generates a movement
    // and must not alter the closure. It is kept out of the grouping entirely.
    if (cents <= 0) continue;

    const key = item.category_key && item.category_key.length > 0 ? item.category_key : OCR_UNRECOGNIZED_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.itemIndexes.push(item.item_index);
      existing.subtotalCents += cents;
      continue;
    }
    byKey.set(key, {
      categoryKey: key,
      itemIndexes: [item.item_index],
      subtotalCents: cents,
      discountCents: 0,
      order: order++,
    });
  }

  const drafts = [...byKey.values()];
  const subtotalCents = drafts.reduce((sum, draft) => sum + draft.subtotalCents, 0);
  const discountCents = Math.min(toCents(ticketDiscount), subtotalCents);
  const shares = distributeDiscount(drafts, discountCents, subtotalCents);

  drafts.forEach((draft, index) => {
    draft.discountCents = shares[index];
  });

  const sumBeforeResidue = drafts.reduce(
    (sum, draft) => sum + (draft.subtotalCents - draft.discountCents),
    0
  );

  // A ticket without a readable total cannot be compared: the items ARE the
  // total and nothing is compensated (no invented money either way).
  const ticketTotalCents =
    input.ticket_total == null || !Number.isFinite(input.ticket_total)
      ? sumBeforeResidue
      : toCents(input.ticket_total);

  let residue = ticketTotalCents - sumBeforeResidue;
  let roundingAdjustmentCents = 0;
  let materialMismatch = false;
  let unresolvedCents = 0;

  if (residue !== 0 && drafts.length > 0) {
    if (Math.abs(residue) <= ROUNDING_TOLERANCE_CENTS) {
      const target = largestGroupIndex(drafts);
      // Compensating must never push a group below zero: that would be
      // inventing a negative movement instead of absorbing a cent.
      if (drafts[target].subtotalCents - drafts[target].discountCents + residue >= 0) {
        roundingAdjustmentCents = residue;
        residue = 0;
      } else {
        materialMismatch = true;
        unresolvedCents = residue;
      }
    } else {
      materialMismatch = true;
      unresolvedCents = residue;
    }
  }

  const groups: OcrCategoryGroup[] = drafts.map((draft) => {
    const isTarget = roundingAdjustmentCents !== 0 && draft === drafts[largestGroupIndex(drafts)];
    const totalCents =
      draft.subtotalCents - draft.discountCents + (isTarget ? roundingAdjustmentCents : 0);
    return {
      category_key: draft.categoryKey,
      item_indexes: draft.itemIndexes,
      subtotal_cents: draft.subtotalCents,
      general_discount_cents: draft.discountCents,
      total_cents: totalCents,
      subtotal: fromCents(draft.subtotalCents),
      general_discount: fromCents(draft.discountCents),
      total: fromCents(totalCents),
      unrecognized: draft.categoryKey === OCR_UNRECOGNIZED_KEY,
    };
  });

  // A negative group total is not a valid movement either: surface it as a
  // material problem instead of writing a negative expense.
  const hasNegativeGroup = groups.some((group) => group.total_cents < 0);
  if (hasNegativeGroup && !materialMismatch) {
    materialMismatch = true;
    unresolvedCents = groups.reduce((sum, group) => sum + Math.min(0, group.total_cents), 0);
  }

  const sumCents = groups.reduce((sum, group) => sum + group.total_cents, 0);

  return {
    groups,
    subtotal_cents: subtotalCents,
    general_discount_cents: discountCents,
    sum_before_residue_cents: sumBeforeResidue,
    sum_cents: sumCents,
    ticket_total_cents: ticketTotalCents,
    rounding_adjustment_cents: roundingAdjustmentCents,
    material_mismatch: materialMismatch,
    unresolved_cents: unresolvedCents,
  };
}

/**
 * Groups that actually produce a movement: one per non-zero final category
 * node (PRD §6, §87, criteria §111.1-§111.2).
 */
export function confirmableGroups(result: OcrGroupingResult): OcrCategoryGroup[] {
  return result.groups.filter((group) => group.total_cents > 0);
}

/** True when the closure is exact: sum of movements equals the ticket total. */
export function isClosureExact(result: OcrGroupingResult): boolean {
  return !result.material_mismatch && result.sum_cents === result.ticket_total_cents;
}

/**
 * Validates a grouping against the confirmation rules (criteria §111.5-§111.10).
 * Returns the i18n key of the blocking problem, or null when it can be confirmed.
 */
export function groupingBlocker(result: OcrGroupingResult): string | null {
  if (confirmableGroups(result).length === 0) return 'ocr.missing_category';
  if (result.material_mismatch) return 'ocr.material_mismatch';
  if (!isClosureExact(result)) return 'ocr.material_mismatch';
  return null;
}
