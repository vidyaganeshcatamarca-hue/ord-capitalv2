// src/lib/notificationKeys.ts
// Mapea los identificadores que produce el backend (Edge Functions) a
// claves i18n que el frontend traduce con t().
// El backend SIEMPRE devuelve `message_key` + `params`, nunca texto en espanol.

export type NotifMessageKey =
  | 'notif_recordatorio_personal_default_titulo'
  | 'notif_recordatorio_personal_default_mensaje'
  | 'notif_recordatorio_personal_diario_titulo'
  | 'notif_recordatorio_personal_semanal_titulo'
  | 'notif_recordatorio_personal_unico_titulo'
  | 'notif_cargar_gastos_titulo'
  | 'notif_cargar_gastos_mensaje'

export interface NotifContent {
  tituloKey: NotifMessageKey
  mensajeKey: NotifMessageKey
  params?: Record<string, string | number>
}

const DEFAULT_PERSONAL: NotifContent = {
  tituloKey: 'notif_recordatorio_personal_default_titulo',
  mensajeKey: 'notif_recordatorio_personal_default_mensaje',
}

const DEFAULT_DAILY: NotifContent = {
  tituloKey: 'notif_cargar_gastos_titulo',
  mensajeKey: 'notif_cargar_gastos_mensaje',
}

/**
 * Devuelve el par (tituloKey, mensajeKey) que el frontend debe usar para
 * traducir una notificacion segun su tipo. Si el backend envia un tipo
 * desconocido, devuelve null y el caller cae a un fallback localizado.
 */
export function resolveNotifKeys(
  tipoNotificacion: string,
  metadata?: Record<string, unknown> | null,
): NotifContent | null {
  if (tipoNotificacion === 'recordatorio_personal') {
    const recurrencia = metadata?.recurrencia
    if (recurrencia === 'diario') {
      return {
        tituloKey: 'notif_recordatorio_personal_diario_titulo',
        mensajeKey: 'notif_recordatorio_personal_default_mensaje',
      }
    }
    if (recurrencia === 'semanal') {
      return {
        tituloKey: 'notif_recordatorio_personal_semanal_titulo',
        mensajeKey: 'notif_recordatorio_personal_default_mensaje',
      }
    }
    if (recurrencia === 'unico') {
      return {
        tituloKey: 'notif_recordatorio_personal_unico_titulo',
        mensajeKey: 'notif_recordatorio_personal_default_mensaje',
      }
    }
    return DEFAULT_PERSONAL
  }
  if (tipoNotificacion === 'reminder_daily_expenses') {
    return DEFAULT_DAILY
  }
  return null
}
