// src/lib/persistentNotification.ts
// Configura la notificacion persistente de captura rapida.
// Android: canal 'ondato_captura_rapida' con ongoing=true.
// iOS: categoria 'CAPTURA_RAPIDA' con accion inline '+ Cargar movimiento'.

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const NOTIF_ID = 1
const CATEGORY_ID = 'CAPTURA_RAPIDA'
const ACTION_ID = 'CARGAR_MOVIMIENTO'
const CHANNEL_ID = 'ondato_captura_rapida'
const CHANNEL_NAME = 'Captura rapida'

let iosCategoryRegistered = false

export async function registerIOSCategory(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  if (iosCategoryRegistered) return
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: CATEGORY_ID,
          actions: [
            {
              id: ACTION_ID,
              title: '+ Cargar movimiento',
            },
          ],
        },
      ],
    })
    iosCategoryRegistered = true
  } catch {
    // Si el plugin falla en web o sin permisos, seguimos sin categoria.
  }
}

export async function setupPersistentCaptureNotification(
  defaultTipo: 'expense' | 'income',
): Promise<void> {
  const platform = Capacitor.getPlatform()
  const title = '+ Cargar movimiento'
  const body =
    defaultTipo === 'expense'
      ? 'Toca para registrar un egreso en 1 toque.'
      : 'Toca para registrar un ingreso en 1 toque.'

  try {
    if (platform === 'android') {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: CHANNEL_NAME,
        importance: 4,
        visibility: 1,
        sound: undefined,
        vibration: false,
      })
    }
    await registerIOSCategory()

    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title,
          body,
          ongoing: platform === 'android',
          channelId: platform === 'android' ? CHANNEL_ID : undefined,
          actionTypeId: platform === 'ios' ? CATEGORY_ID : undefined,
          smallIcon: 'ic_stat_notification',
          autoCancel: platform === 'ios',
        },
      ],
    })
  } catch {
    // En web o sin permisos, la notificacion simplemente no aparece.
  }
}

export async function cancelPersistentCaptureNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] })
  } catch {
    // Idempotente.
  }
}
