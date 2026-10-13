import { createClient } from '@supabase/supabase-js'
import { clearUserSnapshots } from '@/lib/regionSnapshot'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

// Wrapper seguro para todas las RPCs
export async function rpc<T = unknown>(
  name: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    if (isUnauthorized(error)) noteSessionFailure()
    else unauthorizedStreak = 0
    throw error
  }
  unauthorizedStreak = 0
  return data as T
}

/**
 * True only when it is safe to conclude that the session is dead: the client holds a
 * session AND it is not brand new.
 *
 * Why the grace period: during the OAuth callback the code exchange is still running, so
 * any RPC fired in that window goes out anonymously and comes back as
 * `error_unauthorized`. Acting on those killed the session that was being created and
 * threw the user into a login loop.
 */
export async function canTreatSessionAsDead(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  // Nothing to sign out of: the request simply went out before there was a session.
  if (!data?.session) return false
  // We never saw a session start, so we cannot tell "just logged in" from "stale".
  if (sessionStartedAt === null) return false
  return Date.now() - sessionStartedAt >= SESSION_GRACE_MS
}

/**
 * `error_unauthorized` means the backend found no `usuarios` row for the token in the
 * request: the session is stale (the account was removed, or the access token expired
 * and could not be refreshed). When that happens every screen keeps failing with 400s
 * while the app still looks logged in, so the user is stranded on a home screen full of
 * zeros with no way back to the login screen. Dropping the session hands control back to
 * the route guards.
 *
 * One hit is NOT enough: right after signup there is a short window where the row may
 * not be visible yet, and `checkOnboarding` already retries for that. Two consecutive
 * hits AND a session that is no longer fresh mean the session is genuinely dead.
 */
const UNAUTHORIZED_STREAK_TO_SIGN_OUT = 2
const SESSION_GRACE_MS = 30_000
let unauthorizedStreak = 0

// Start of the current session, as observed by the SDK. Null means there is none.
let sessionStartedAt: number | null = null
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    if (sessionStartedAt === null) sessionStartedAt = Date.now()
  } else {
    sessionStartedAt = null
  }
})

function isUnauthorized(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : ((error as { message?: string } | null)?.message ?? '')
  return message.includes('error_unauthorized')
}

function noteSessionFailure(): void {
  unauthorizedStreak += 1
  if (unauthorizedStreak < UNAUTHORIZED_STREAK_TO_SIGN_OUT) return
  unauthorizedStreak = 0
  void (async () => {
    if (!(await canTreatSessionAsDead())) return
    console.warn('[supabase] la sesion no es valida en el backend; cerrando sesion')
    try {
      clearUserSnapshots()
    } catch {
      // Storage can be blocked; the sign-out below is what matters.
    }
    void supabase.auth.signOut().catch(() => {
      // The local session is dropped either way, and the guards react to that.
    })
  })()
}
