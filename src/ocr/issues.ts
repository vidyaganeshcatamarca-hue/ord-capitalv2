// src/ocr/issues.ts
// ============================================
// OCR v1 - issue labels shown to the owner
// ============================================
//
// The card collects issue codes from two sources: the ones the backend declared
// (`metadata.issues[].code`) and the ones the frontend derives while reading the
// ticket (missing category, missing payment, missing date, amount mismatch).
//
// It deduplicated the CODES. A backend code that has no dedicated label and one
// that is a dedicated key are different codes, but both can end up as the same
// sentence: every unknown code falls back to `ocr.issue_generic`. The owner then
// read "The system flagged data for review" twice on the same ticket, with no way
// to tell whether that meant two problems or one.
//
// The chips are therefore deduplicated by the resolved text, which is what the
// owner actually reads. The code list itself is left untouched: telemetry still
// needs every code, and dropping a code there would hide a real problem.

/**
 * Resolves issue codes to the labels the owner reads, in order, without
 * repeating a sentence.
 *
 * `translate` is injected instead of imported so the function stays pure and
 * testable without an i18n runtime, and so the caller decides which dictionary
 * resolves the labels.
 */
export function resolveOcrIssueLabels(
  issues: readonly string[],
  translate: (key: string) => string,
): string[] {
  const labels = issues.map((issue) =>
    issue.startsWith('ocr.') ? translate(issue) : translate('ocr.issue_generic'),
  )
  return [...new Set(labels)]
}
