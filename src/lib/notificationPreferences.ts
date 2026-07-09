// src/lib/notificationPreferences.ts
// Preferencias locales de la notificacion persistente.
// Se guardan en localStorage porque el backend no tiene columnas dedicadas
// para notif_persistent_* en p_notificaciones_config (limitacion documentada).

const KEY = 'notif_persistent_capture_v1'

export interface PersistentCapturePrefs {
  enabled: boolean
  defaultTipo: 'expense' | 'income'
}

const DEFAULT: PersistentCapturePrefs = { enabled: false, defaultTipo: 'expense' }

export function getPersistentPrefs(): PersistentCapturePrefs {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw)
    return {
      enabled: Boolean(parsed?.enabled),
      defaultTipo: parsed?.defaultTipo === 'income' ? 'income' : 'expense',
    }
  } catch {
    return DEFAULT
  }
}

export function setPersistentPrefs(prefs: PersistentCapturePrefs): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(prefs))
}
