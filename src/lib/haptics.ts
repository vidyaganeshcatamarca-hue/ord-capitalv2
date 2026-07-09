import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const isAvailable = (() => {
  try {
    return typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
})()

const safe = async (fn: () => Promise<void>) => {
  if (!isAvailable) return
  try {
    await fn()
  } catch {
    // Silenciar errores de haptics en web
  }
}

export const haptics = {
  light: () => safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  medium: () => safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  heavy: () => safe(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  success: () =>
    safe(() => Haptics.notification({ type: NotificationType.Success })),
  warning: () =>
    safe(() => Haptics.notification({ type: NotificationType.Warning })),
  error: () =>
    safe(() => Haptics.notification({ type: NotificationType.Error })),
}
