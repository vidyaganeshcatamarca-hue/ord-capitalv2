// tests/ocr_grouping.test.js
// ============================================
// OCR grouping, proportional discounts and cent-exact closure
// ============================================
// Every example the definitive PRD makes mandatory lives here:
//   §118 rounding, §119 grouping, §120 OCR no reconocidos, §121 general discount.
// Plus the rules §87 (zero amount), §11 (product discount stays in the product)
// and §89 (a material difference is never invented).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OCR_UNRECOGNIZED_KEY,
  computeTicketGroups,
  confirmableGroups,
  fromCents,
  groupingBlocker,
  isClosureExact,
  toCents,
} from '../src/ocr/grouping.ts';

const item = (item_index, net_amount, category_key) => ({ item_index, net_amount, category_key });

test('PRD §119: three products in two categories produce exactly two groups', () => {
  const result = computeTicketGroups({
    items: [item(0, 100, 'lacteos'), item(1, 200, 'lacteos'), item(2, 300, 'hogar')],
    ticket_total: 600,
  });

  assert.equal(result.groups.length, 2);
  assert.deepEqual(
    result.groups.map((group) => [group.category_key, group.total]),
    [
      ['lacteos', 300],
      ['hogar', 300],
    ]
  );
  assert.equal(result.groups[0].item_indexes.length, 2);
  assert.equal(result.sum_cents, 60000);
  assert.equal(result.material_mismatch, false);
  assert.ok(isClosureExact(result));
});

test('PRD §120: unclassified products fall into OCR no reconocidos', () => {
  const result = computeTicketGroups({
    items: [item(0, 100, 'lacteos'), item(1, 200, null), item(2, 300, null)],
    ticket_total: 600,
  });

  const byKey = new Map(result.groups.map((group) => [group.category_key, group]));
  assert.equal(byKey.size, 2);
  assert.equal(byKey.get('lacteos').total, 100);
  assert.equal(byKey.get(OCR_UNRECOGNIZED_KEY).total, 500);
  assert.equal(byKey.get(OCR_UNRECOGNIZED_KEY).item_indexes.length, 2);
  assert.equal(byKey.get(OCR_UNRECOGNIZED_KEY).unrecognized, true);
  assert.equal(confirmableGroups(result).length, 2);
  assert.equal(result.sum_cents, 60000);
});

test('PRD §121: a general discount is distributed proportionally', () => {
  const result = computeTicketGroups({
    items: [item(0, 6000, 'lacteos'), item(1, 4000, 'verduleria')],
    general_discount: 1000,
    ticket_total: 9000,
  });

  assert.deepEqual(
    result.groups.map((group) => [group.category_key, group.general_discount, group.total]),
    [
      ['lacteos', 600, 5400],
      ['verduleria', 400, 3600],
    ]
  );
  assert.equal(result.sum_cents, 900000);
  assert.equal(result.ticket_total_cents, 900000);
  assert.equal(result.material_mismatch, false);
});

test('PRD §118: fractional cents never break the closure', () => {
  const result = computeTicketGroups({
    items: [item(0, 33.33, 'a'), item(1, 33.33, 'b'), item(2, 33.34, 'c')],
    general_discount: 0.07,
    ticket_total: 99.93,
  });

  assert.equal(result.material_mismatch, false);
  assert.equal(result.sum_cents, result.ticket_total_cents);
  assert.equal(result.sum_cents, 9993);
  // The distributed discount adds up exactly to the ticket discount.
  const distributed = result.groups.reduce((sum, group) => sum + group.general_discount_cents, 0);
  assert.equal(distributed, 7);
});

test('a cent residue lands deterministically on the largest group', () => {
  const result = computeTicketGroups({
    items: [item(0, 10, 'small'), item(1, 30, 'big')],
    ticket_total: 40.02,
  });

  const big = result.groups.find((group) => group.category_key === 'big');
  const small = result.groups.find((group) => group.category_key === 'small');
  assert.equal(big.total_cents - big.subtotal_cents, 2);
  assert.equal(small.total_cents, small.subtotal_cents);
  assert.equal(result.rounding_adjustment_cents, 2);
  assert.equal(result.sum_cents, 4002);
  assert.equal(result.material_mismatch, false);
});

test('PRD §89: a material difference is reported, never absorbed', () => {
  const result = computeTicketGroups({ items: [item(0, 100, 'a')], ticket_total: 130 });

  assert.equal(result.material_mismatch, true);
  assert.equal(result.unresolved_cents, 3000);
  assert.equal(result.sum_cents, 10000);
  assert.equal(isClosureExact(result), false);
  assert.equal(groupingBlocker(result), 'ocr.material_mismatch');
});

test('PRD §87: a zero-amount product creates no group and does not alter closure', () => {
  const result = computeTicketGroups({
    items: [item(0, 100, 'a'), item(1, 0, 'b')],
    ticket_total: 100,
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].category_key, 'a');
  assert.equal(result.sum_cents, 10000);
  assert.equal(result.material_mismatch, false);
});

test('PRD §11: a product discount stays in the product and is never redistributed', () => {
  // Both products already carry their net amount (5000 - 500 = 4500).
  const result = computeTicketGroups({
    items: [item(0, 4500, 'lacteos'), item(1, 2000, 'verduleria')],
    general_discount: 0,
    ticket_total: 6500,
  });

  assert.deepEqual(
    result.groups.map((group) => group.total),
    [4500, 2000]
  );
  assert.equal(result.general_discount_cents, 0);
});

test('a ticket without a readable total does not invent a mismatch', () => {
  const result = computeTicketGroups({
    items: [item(0, 100, 'a'), item(1, 50, 'b')],
    ticket_total: null,
  });

  assert.equal(result.material_mismatch, false);
  assert.equal(result.sum_cents, 15000);
  assert.equal(result.ticket_total_cents, 15000);
  assert.ok(isClosureExact(result));
});

test('a discount larger than the ticket is clamped to the subtotal', () => {
  const result = computeTicketGroups({
    items: [item(0, 100, 'a')],
    general_discount: 500,
    ticket_total: 0,
  });

  assert.equal(result.general_discount_cents, 10000);
  assert.equal(result.groups[0].total_cents, 0);
  assert.equal(result.sum_cents, 0);
});

test('no confirmable group blocks the confirmation with a category message', () => {
  const result = computeTicketGroups({ items: [], ticket_total: null });
  assert.equal(confirmableGroups(result).length, 0);
  assert.equal(groupingBlocker(result), 'ocr.missing_category');
});

test('cents conversion is half-up and stable', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(Number.NaN), 0);
  assert.equal(fromCents(101), 1.01);
});

test('la coincidencia se juzga en unidades enteras, no en centavos invisibles', () => {
  // The owner's real case: groups sum 27835.50, the UI shows 27836, and the
  // invisible 50 cents made the closure impossible to satisfy.
  const result = {
    material_mismatch: false,
    sum_cents: 2783550,
    ticket_total_cents: 2783600,
  }
  assert.ok(isClosureExact(result))
})

test('la tolerancia es de media unidad, no de un importe', () => {
  // 27835.50 vs 27840 is a real difference and must still block.
  assert.equal(
    isClosureExact({ material_mismatch: false, sum_cents: 2783550, ticket_total_cents: 2784000 }),
    false
  )
  // Truncating the sum would give 27835 and fail against 27836; rounding is why
  // this passes. Pinned so nobody "simplifies" it to Math.trunc.
  assert.ok(
    isClosureExact({ material_mismatch: false, sum_cents: 2783550, ticket_total_cents: 2783600 })
  )
  // A material problem still wins over any rounding.
  assert.equal(
    isClosureExact({ material_mismatch: true, sum_cents: 2783550, ticket_total_cents: 2783600 }),
    false
  )
})
