// hooks/useDivisasCotizadas.ts
// ============================================
// The quoted-currency catalog for the extras selectors (S9).
//
// Data source: `fn_obtener_divisas_cotizadas()` — the currencies the cron
// actually quotes; a currency outside this list cannot guarantee a rate, so
// the selectors never offer it. Same memoized-promise pattern as
// useMonedasExtra / useNumberFormat (several mounts share one RPC).
import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useOptionalAuth } from '@/contexts/AuthContext'

let divisasPromise: Promise<string[] | null> | null = null

export function invalidateDivisasCotizadasCache(): void {
  divisasPromise = null
}

function fetchDivisas(): Promise<string[] | null> {
  if (!divisasPromise) {
    divisasPromise = rpc<unknown>('fn_obtener_divisas_cotizadas')
      .then((data) => {
        // RETURNS text[]: PostgREST delivers the array or a wrapper object.
        const raw =
          Array.isArray(data)
            ? data
            : data && typeof data === 'object'
              ? (data as Record<string, unknown>).fn_obtener_divisas_cotizadas
              : null
        return Array.isArray(raw) ? raw.map((x) => String(x ?? '')) : null
      })
      .catch(() => {
        divisasPromise = null
        return null
      })
  }
  return divisasPromise
}

export function useDivisasCotizadas(): { divisas: string[]; loading: boolean } {
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  const [divisas, setDivisas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchDivisas().then((resolved) => {
      if (cancelled) return
      setDivisas(resolved ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  return { divisas, loading }
}