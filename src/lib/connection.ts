// src/lib/connection.ts
// ============================================
// Connection awareness for the Home sync badge
// ============================================
//
// Owner (2026-11-02): "el cartel de datos sincronizados pareciera hardcodeado. La
// aplicación no detecta que no se puede comunicar con la base [...] tendrá que estar
// en rojo avisando de que no hay conexión". Offline the badge kept its green dot and
// said the data was synced, so the user suspected the app instead of the network.

import { useEffect, useState } from 'react'

export interface SyncBadge {
  /** CSS class of the status dot. */
  dot: string
  /** i18n key of the label. */
  key: string
}

/**
 * What the Home sync badge must say for a given connectivity state.
 *
 * Pure on purpose: the mapping is the whole rule, so it is testable without a DOM.
 * `false` is not "we don't know": the browser tells us the device has no network,
 * and saying "synced" there is a lie the user has to disprove by watching $0.
 */
export function syncBadge(online: boolean): SyncBadge {
  return online
    ? { dot: 'dot-green', key: 'hero_sync_ok' }
    : { dot: 'dot-red', key: 'hero_sync_offline' }
}

/**
 * Tracks whether the device reports a network connection.
 *
 * `navigator.onLine` answers "is there a network interface up", not "can I reach
 * Supabase". Airplane mode, which is the reported case, is exactly what it catches;
 * a captive portal that drops the API needs a request failure, which is a separate
 * concern and not silently faked here.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
