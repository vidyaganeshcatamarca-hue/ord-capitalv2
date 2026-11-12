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
  | 'notif_cuarentena_pendiente_titulo'
  | 'notif_cuarentena_pendiente_mensaje'
  | 'notif_cuenta_desconciliada_titulo'
  | 'notif_cuenta_desconciliada_mensaje'
  | 'notif_vencimiento_tarjeta_titulo'
  | 'notif_vencimiento_tarjeta_mensaje'
  | 'notif_deuda_por_vencer_titulo'
  | 'notif_deuda_por_vencer_mensaje'
  | 'notif_categoria_en_rojo_titulo'
  | 'notif_categoria_en_rojo_mensaje'
  | 'notif_ahorro_en_riesgo_titulo'
  | 'notif_ahorro_en_riesgo_mensaje'

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
  if (tipoNotificacion === 'cuarentena_pendiente') {
    return {
      tituloKey: 'notif_cuarentena_pendiente_titulo',
      mensajeKey: 'notif_cuarentena_pendiente_mensaje',
    }
  }
  if (tipoNotificacion === 'cuenta_desconciliada') {
    return {
      tituloKey: 'notif_cuenta_desconciliada_titulo',
      mensajeKey: 'notif_cuenta_desconciliada_mensaje',
    }
  }
  if (tipoNotificacion === 'vencimiento_tarjeta') {
    return {
      tituloKey: 'notif_vencimiento_tarjeta_titulo',
      mensajeKey: 'notif_vencimiento_tarjeta_mensaje',
    }
  }
  if (tipoNotificacion === 'deuda_por_vencer') {
    return {
      tituloKey: 'notif_deuda_por_vencer_titulo',
      mensajeKey: 'notif_deuda_por_vencer_mensaje',
    }
  }
  if (tipoNotificacion === 'categoria_en_rojo') {
    return {
      tituloKey: 'notif_categoria_en_rojo_titulo',
      mensajeKey: 'notif_categoria_en_rojo_mensaje',
    }
  }
  if (tipoNotificacion === 'ahorro_en_riesgo') {
    return {
      tituloKey: 'notif_ahorro_en_riesgo_titulo',
      mensajeKey: 'notif_ahorro_en_riesgo_mensaje',
    }
  }
  if (tipoNotificacion === 'reminder_daily_expenses') {
    return DEFAULT_DAILY
  }
  return null
}
