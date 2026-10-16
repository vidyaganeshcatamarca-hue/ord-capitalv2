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
import { useOptionalAuth } from '@/contexts/AuthContext'

let extrasPromise: Promise<string[] | null> | null = null

/** Drops the memoized request so the next call hits the RPC again. */
export function invalidateMonedasExtraCache(): void {
  extrasPromise = null
}

function fetchMonedasExtra(): Promise<string[] | null> {
  if (!extrasPromise) {
    extrasPromise = rpc<unknown[]>('fn_obtener_monedas_extra')
      .then((data) => {
        const row = Array.isArray(data) ? data[0] : data
        // fn_obtener_monedas_extra RETURNS jsonb: PostgREST delivers either the
        // bare array (["USD"]) or [{fn_obtener_monedas_extra: [...]}], depending
        // on the REST shape. Both fold into string[]; anything else is null.
        const raw =
          row == null
            ? null
            : typeof row === 'object' && !Array.isArray(row)
              ? (row as Record<string, unknown>).fn_obtener_monedas_extra
              : row
        const list = Array.isArray(raw) ? raw.map((x) => String(x ?? '')) : null
        return list
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