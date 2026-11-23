// src/ocr/sessionGuard.ts
// ============================================
// OCR - a poll callback may only act for the session that started it
// ============================================
//
// The race this closes:
//   1. user A starts polling job A;
//   2. the request stays in flight;
//   3. the app switches to user B;
//   4. A's old response finally arrives.
//
// That callback must not touch B's visible state, must not create a quarantine
// row under B, and must not rewrite the stored job. Comparing the owner captured
// when the poll started against the owner active now is the whole rule, kept in
// one place so it can be tested without a React renderer.

/**
 * True when a callback belongs to a session that is no longer active.
 *
 * `null` on either side is compared as a value: a poll started without a session
 * is stale as soon as any session exists, and a poll started with one is stale
 * as soon as the app signs out.
 */
export function isStaleSessionCallback(
  pollSessionOwner: string | null,
  activeSessionOwner: string | null
): boolean {
  return pollSessionOwner !== activeSessionOwner;
}
