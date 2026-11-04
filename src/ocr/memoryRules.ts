// src/ocr/memoryRules.ts
// ============================================
// OCR v1 - Pure rules of the personal category memory
// ============================================
//
// Kept import-free on purpose (types only): these rules are the product
// contract and must be testable without a browser, a network or telemetry.
//
// Normative source: definitive PRD §18-§21, §110 and contract v1 §15-§22.
//
//   1. Only an EXPLICIT classification change is a correction. Accepting the
//      automated proposal is not (§19 case C, §110.1).
//   2. `ocr_unrecognized` is absence of knowledge, never a semantic class, so it
//      is never learned (§10, §110.6).
//   3. Saving twice without changes is not two corrections (§110.10): the
//      baseline is the last SAVED category, not the number of Save clicks.

// Explicit `.ts` specifier: this module is imported directly by the Node test
// suite (type stripping has no path extension resolution). The repo allows it
// (`allowImportingTsExtensions`) and Vite resolves it identically.
import { OCR_UNRECOGNIZED_KEY } from './grouping.ts';
import type { OcrItem } from './types';

/** A correction to register: never carries the product description. */
export interface OcrCategoryCorrection {
  item_index: number;
  category_id: string;
  category_name: string;
  category_parent_name: string | null;
}

/** Resolves a category id to the names the contract requires. */
export type OcrCategoryNameResolver = (
  categoryId: string
) => { name: string; parent_name: string | null } | null;

/**
 * Baseline a correction is measured against: what the user last persisted, and
 * the backend proposal before the first save.
 */
export function effectiveSavedCategory(item: OcrItem): string | null {
  const saved = item.saved_category_id;
  if (typeof saved === 'string' && saved.length > 0) return saved;
  return item.original_category_id ?? null;
}

/** True when assigning this category must not teach the system anything. */
export function isNonLearnableCategory(categoryId: string | null | undefined): boolean {
  if (!categoryId) return true;
  return categoryId === OCR_UNRECOGNIZED_KEY;
}

/**
 * Corrections produced by the current edit state.
 * `resolve` returns null for a category that no longer exists: that item is
 * skipped instead of sending a half-empty memory (PRD §84).
 */
export function collectCategoryCorrections(
  items: readonly OcrItem[],
  resolve: OcrCategoryNameResolver
): OcrCategoryCorrection[] {
  const corrections: OcrCategoryCorrection[] = [];

  for (const item of items) {
    const current = item.current_category_id;
    // PRD §10: staying in the fallback is not knowledge.
    if (isNonLearnableCategory(current)) continue;
    // PRD §19 case C / §110.1: accepting the proposal is not a correction.
    if (current === effectiveSavedCategory(item)) continue;

    const resolved = resolve(current as string);
    if (!resolved) continue;

    corrections.push({
      item_index: item.item_index,
      category_id: current as string,
      category_name: resolved.name,
      category_parent_name: resolved.parent_name,
    });
  }

  return corrections;
}
