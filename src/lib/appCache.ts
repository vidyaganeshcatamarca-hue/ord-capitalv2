// src/lib/appCache.ts
// Borra la caché local de la PWA (Cache Storage, localStorage no esencial,
// sessionStorage, IndexedDB) y desregistra el Service Worker. La sesión
// de Supabase en localStorage se preserva para que el usuario no quede
// deslogueado.

export interface ClearAppCacheResult {
  ok: boolean
  error?: string
  details?: {
    unregistered: number
    cachesDeleted: number
    localStorageRemoved: number
    sessionStorageCleared: boolean
    indexedDBRemoved: number
  }
}

export interface ClearAppCacheDeps {
  window?: Window
  navigator?: Navigator
  reload?: boolean
}

const SUPABASE_KEY_PATTERNS = [
  /^supabase\.auth\.token$/i,
  /^sb-.*-auth-token$/i,
  /^sb-.*-auth-token-code-verifier$/i,
]

function isSupabaseKey(key: string): boolean {
  return SUPABASE_KEY_PATTERNS.some((re) => re.test(key))
}

/**
 * OCR recovery state that MUST survive a cache wipe.
 *
 * Definitive OCR PRD §95: "Borrar caché" deletes the local OCR image copies and
 * their manifests, but NOT "active job ids necesarios para recuperación",
 * quarantines, movements or the backend category memory.
 *
 * This matters: an OCR job legally waits DAYS for inference (§36), so wiping its
 * id on a cache clear would orphan a ticket the user already uploaded — the one
 * outcome §34 and §76 forbid. The pending correction queue is preserved for the
 * same reason (§24: keep the pending correction and retry).
 */
const OCR_RECOVERY_KEY_PATTERNS = [
  /^ord\.ocr\.v1\.active_jobs$/i,
  /^ord\.ocr\.v1\.pending_memory$/i,
]

function isRecoveryStateKey(key: string): boolean {
  return OCR_RECOVERY_KEY_PATTERNS.some((re) => re.test(key))
}

export async function clearAppCache(deps: ClearAppCacheDeps = {}): Promise<ClearAppCacheResult> {
  const w = deps.window ?? (typeof window !== 'undefined' ? window : undefined)
  const n = deps.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined)
  const shouldReload = deps.reload ?? true

  if (!w || !n) {
    return { ok: false, error: 'No window/navigator available (SSR)' }
  }

  const details = {
    unregistered: 0,
    cachesDeleted: 0,
    localStorageRemoved: 0,
    sessionStorageCleared: false,
    indexedDBRemoved: 0,
  }

  try {
    // 1) Desregistrar todos los Service Workers
    if (n.serviceWorker && typeof n.serviceWorker.getRegistrations === 'function') {
      const registrations = await n.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        if (typeof reg.unregister === 'function') {
          await reg.unregister()
          details.unregistered++
        }
      }
    }

    // 2) Borrar todas las caches de Cache Storage
    if (w.caches && typeof w.caches.keys === 'function') {
      const names = await w.caches.keys()
      for (const name of names) {
        await w.caches.delete(name)
        details.cachesDeleted++
      }
    }

    // 3) localStorage: borrar todo menos tokens de Supabase
    if (w.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < w.localStorage.length; i++) {
        const key = w.localStorage.key(i)
        // Recovery state (OCR jobs, pending memory) outlives a cache wipe: the
        // cache is disposable, an already-received ticket is not.
        if (key && !isSupabaseKey(key) && !isRecoveryStateKey(key)) {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) {
        w.localStorage.removeItem(key)
        details.localStorageRemoved++
      }
    }

    // 4) sessionStorage: limpiar
    if (w.sessionStorage) {
      w.sessionStorage.clear()
      details.sessionStorageCleared = true
    }

    // 5) IndexedDB: borrar todas las DB conocidas
    if (w.indexedDB && typeof (w.indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases === 'function') {
      const dbs = await (w.indexedDB as IDBFactory & { databases: () => Promise<{ name?: string }[]> }).databases()
      for (const dbInfo of dbs) {
        if (dbInfo.name) {
          await new Promise<void>((resolve) => {
            const req = w.indexedDB!.deleteDatabase(dbInfo.name!)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          })
          details.indexedDBRemoved++
        }
      }
    }

    // 6) Recargar la página para forzar re-registro del SW y redownload de assets
    if (shouldReload && w.location && typeof w.location.reload === 'function') {
      w.location.reload()
    }

    return { ok: true, details }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      details,
    }
  }
}
