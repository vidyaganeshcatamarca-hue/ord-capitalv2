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
import { reuseForUser, type UserKeyedEntry } from '@/lib/userCache'

// Dueño, 2026-10-24 (ronda 4): "no sé si la segunda y la tercera moneda me las
// muestra bien o las heredó del usuario anterior cargado en el mismo teléfono".
// Las heredaba. Este memo era de módulo y no distinguía usuario: el 198 dejaba
// ["BRL","ARS"] y el 20, en la misma SPA, veía esas dos como su segunda y tercera
// moneda. Al tocar la ✕ de la tercera, el front pedía ['BRL'] y el backend —que sí
// sabe de quién es— quitaba USD, la extra real del 20, y respondía
// error_monedas_extra_has_wallets con el nombre de USD: el mensaje "hablaba de
// dólares" con la pantalla diciendo pesos.
//
// La regla es la misma de `useNumberFormat` (lib/userCache.ts): una memo pertenece
// a UN usuario. Si el usuario cambió, no se reusa.
let extrasEntry: UserKeyedEntry<string[] | null> | null = null

/** Drops the memoized request so the next call hits the RPC again. */
export function invalidateMonedasExtraCache(): void {
  extrasEntry = null
}

function fetchMonedasExtra(userId: string): Promise<string[] | null> {
  const reusada = reuseForUser(extrasEntry, userId)
  if (reusada) return reusada

  const promise = rpc<unknown>('fn_obtener_monedas_extra')
    .then((data) => {
      // RETURN jsonb: la forma que llega NO es fija (array puro, wrapper con
      // la key del fn, o fila-objeto con alias). El parser puro cubre las 4
      // formas; el bug tanda-2 (BUG3) asumía wrapper y leía [] con array
      // puro — persistencia OK y UI siempre 'Sin moneda'.
      return parseJsonbStringArray(data, 'fn_obtener_monedas_extra')
    })
    .catch(() => {
      // Un fallo NO se cachea: el próximo montaje (o reload) reintenta.
      if (extrasEntry?.userId === userId) extrasEntry = null
      return null
    })

  extrasEntry = { userId, promise }
  return promise
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
    fetchMonedasExtra(userId).then((resolved) => {
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