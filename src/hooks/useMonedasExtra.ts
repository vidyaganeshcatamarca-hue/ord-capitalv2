// hooks/useMonedasExtra.ts
// ============================================
// The user's configured extra currencies ("monedas extra libres", T1).
//
// Data source: `fn_obtener_monedas_extra()` — the effective extras the backend
// itself resolves: uppercase, deduped, local currency always excluded (a US
// user whose stored default is ["USD"] gets []).
//
// The hook mounts on several screens (Billeteras picker now; more as T3-T8
// land), so the in-flight promise is memoized at module scope, exactly like
// `fetchUserRegion` in useNumberFormat: N mounts share one RPC instead of
// firing N identical requests. A failure is intentionally NOT cached so a
// later mount (or reloadMonedasExtra) can retry.
import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseJsonbStringArray } from '@/lib/jsonbRpc'
import { useOptionalAuth } from '@/contexts/AuthContext'

let extrasPromise: Promise<string[] | null> | null = null

/** Drops the memoized request so the next call hits the RPC again. */
export function invalidateMonedasExtraCache(): void {
  extrasPromise = null
}

function fetchMonedasExtra(): Promise<string[] | null> {
  if (!extrasPromise) {
    extrasPromise = rpc<unknown>('fn_obtener_monedas_extra')
      .then((data) => {
        // RETURN jsonb: la forma que llega NO es fija (array puro, wrapper con
        // la key del fn, o fila-objeto con alias). El parser puro cubre las 4
        // formas; el bug tanda-2 (BUG3) asumía wrapper y leía [] con array
        // puro — persistencia OK y UI siempre 'Sin moneda'.
        return parseJsonbStringArray(data, 'fn_obtener_monedas_extra')
      })
      .catch(() => {
        extrasPromise = null
        return null
      })
  }
  return extrasPromise
}

export function useMonedasExtra(): { extras: string[]; loading: boolean; reload: () => void } {
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  const [extras, setExtras] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    fetchMonedasExtra().then((resolved) => {
      if (cancelled) return
      setExtras(resolved ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  const reload = () => {
    invalidateMonedasExtraCache()
    setAttempt((n) => n + 1)
  }

  return { extras, loading, reload }
}