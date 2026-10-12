// api/geo.ts
// ============================================
// Country of the requester, as seen by Vercel's own proxy.
//
// Why not a third-party geo API: Vercel already terminates the connection, so the
// header it attaches is free, needs no key, and keeps the user's IP inside the
// infrastructure that already processes it. Nothing new to disclose.
//
// IMPORTANT: Vercel does not set the geolocation headers when running locally, so
// this answers `{ country: null }` in dev and the client falls back to the device
// locale. The client must therefore always treat a null answer as "no signal",
// never as an error.
//
// Note: this file lives outside `src/`, which is the only path in tsconfig's
// `include`, so it is not part of the type gate. Types are written explicitly to
// keep it readable anyway.

interface MinimalRequest {
  headers?: Record<string, string | string[] | undefined>
}

interface MinimalResponse {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

/** Two uppercase letters, or null. Anything else is a header we do not understand. */
function normalizeCountryCode(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null
}

export default function handler(req: MinimalRequest, res: MinimalResponse): void {
  const country = normalizeCountryCode(req?.headers?.['x-vercel-ip-country'])

  // The answer depends on the caller's IP, so it is private to this browser for an
  // hour: long enough to stop repeating the call on every navigation, short enough
  // to notice a change of network.
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.status(200).json({ country })
}
