// src/voice/codec.ts
// ============================================
// Voice v1 - Audio codec / MediaRecorder capabilities
// ============================================

/**
 * MIME types the voice backend accepts, in order of preference.
 * Opus variants keep the upload small for short voice notes.
 */
export const SUPPORTED_MIME_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/mp4',
] as const;

export type SupportedMime = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Picks the first MIME type supported by the current MediaRecorder.
 * Returns null when MediaRecorder exists but supports none of the listed types.
 * Falls back to the first entry in non-browser environments (SSR / tests).
 */
export function pickSupportedMime(): SupportedMime | null {
  if (typeof MediaRecorder === 'undefined') {
    // Fallback for SSR / test env. More permissive: return the first entry.
    return SUPPORTED_MIME_TYPES[0];
  }
  for (const mime of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

/** Returns true when the current browser can record audio via getUserMedia. */
export function isBrowserSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}
