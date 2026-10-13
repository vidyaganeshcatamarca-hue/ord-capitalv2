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
 * `error_unauthorized` means the backend found no `usuarios` row for the token in the
 * request: the session is stale (the account was removed, or the access token expired
 * and could not be refreshed). When that happens every screen keeps failing with 400s
 * while the app still looks logged in, so the user is stranded on a home screen full of
 * zeros with no way back to the login screen. Dropping the session hands control back to
 * the route guards.
 *
 * One hit is NOT enough: right after signup there is a short window where the row may
 * not be visible yet, and `checkOnboarding` already retries for that. Two consecutive
 * hits mean the session is genuinely dead.
 */
const UNAUTHORIZED_STREAK_TO_SIGN_OUT = 2
let unauthorizedStreak = 0

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
  console.warn('[supabase] la sesion no es valida en el backend; cerrando sesion')
  try {
    clearUserSnapshots()
  } catch {
    // Storage can be blocked; the sign-out below is what matters.
  }
  void supabase.auth.signOut().catch(() => {
    // The local session is dropped either way, and the guards react to that.
  })
}
