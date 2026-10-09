import { rpc } from '@/lib/supabase'
import { LEGAL_VERSIONS } from '@/config/legal'

export type ConsentimientoResult = { ok: boolean }
export type LegalDocLink = 'tyc' | 'privacidad'

/** Nivel de politica que el backend derivo para la version vigente del doc. */
export type LegalPendingAction = 'none' | 'notify' | 'require_acceptance'

/** Estado legal de un documento (bloque del jsonb de la RPC). */
export interface LegalDocEstado {
  /**
   * Version vigente del documento. Es `text` en la tabla: NUNCA `Number()`.
   * La comparacion de versiones la resuelve el backend (`fn_compare_versions`),
   * el front solo la pinta.
   */
  current_version: string | null
  requires_acceptance: boolean
  requires_notification: boolean
  pending_action: LegalPendingAction
}

/** Estado legal completo del usuario autenticado (`fn_obtener_estado_legal`). */
export interface LegalEstado {
  terminos: LegalDocEstado
  privacidad: LegalDocEstado
}

/**
 * Versiones a sellar como `'aceptado'` en `fn_registrar_consentimiento_legal`.
 * `null` = no registrar aceptacion para ese documento (la RPC lo ignora).
 */
export interface ConsentimientoVersions {
  terminos: string | null
  privacidad: string | null
}

/**
 * Registra el consentimiento legal del usuario autenticado.
 *
 * Resuelve identidad via auth.uid() en backend; idempotente (una sola fila
 * por `(user_id, doc_type, version)` en `p_legal_consentimientos`). Usado en
 * el camino OAuth y como red de seguridad para usuarios sin eventos. El
 * camino email lo persiste `fn_handle_new_user` desde signUp() options.data.
 *
 * `versions` default = `LEGAL_VERSIONS` (bootstrap del sign-up). El gate de
 * re-aceptacion (§5) pasa las versiones vigentes que devuelve
 * `fn_obtener_estado_legal`, para no sellar con un valor bootstrap viejo.
 *
 * try/catch + async/await (Regla de Oro #13: sin .then().catch()).
 */
export async function registrarConsentimiento(
  versions: ConsentimientoVersions = LEGAL_VERSIONS,
): Promise<ConsentimientoResult> {
  const data = await rpc<ConsentimientoResult>('fn_registrar_consentimiento_legal', {
    p_terminos_version: versions.terminos,
    p_privacidad_version: versions.privacidad,
  })
  // Aceptar implica notificado (versionado-legal §5): sin esto, cada nuevo
  // sign-up veria el modal de aviso justo despues de haber aceptado esa
  // misma version en el gate de onboarding. Fire-and-forget: si falla, la
  // proxima `obtenerEstadoLegal` vuelve a derivar 'notify' y se reintenta —
  // el modal es inofensivo, solo duplicado potencial.
  try {
    await registrarNotificacionLegal()
  } catch {
    // best-effort: la aceptacion ya quedo registrada
  }
  return data
}

/**
 * Lee el estado legal del usuario autenticado (`fn_obtener_estado_legal`).
 *
 * Fuente de verdad en runtime de versiones vigentes + flags + `pending_action`
 * (spec versionado-legal §5). Se llama UNA vez al arranque de sesion; el front
 * solo pinta lo que el backend calculo. Identidad via auth.uid().
 *
 * Requiere sesion: sin usuario la RPC responde error_unauthorized. El caller
 * decide el manejo (el gate hace fail-open ante errores de infra).
 * async/await + try/catch del caller (Regla de Oro #13).
 */
export async function obtenerEstadoLegal(): Promise<LegalEstado> {
  const data = await rpc<LegalEstado>('fn_obtener_estado_legal')
  return data
}

/**
 * Sella el aviso (`'notificado'`) de la version vigente de cada documento.
 *
 * Idempotente por `(user_id, doc_type, version)`; sin parametros de version a
 * proposito: el backend sella la version vigente que el modal mostro
 * (spec §4.1). La llama el modal combinado de novedad legal ("Continuar").
 */
export async function registrarNotificacionLegal(): Promise<ConsentimientoResult> {
  const data = await rpc<ConsentimientoResult>('fn_registrar_notificacion_legal')
  return data
}

/**
 * Registra la APERTURA de un documento legal (Telemetria Tanda 2).
 *
 * ANTI-BYPASS (versionado-legal §5): envia `null` en AMBAS versiones. La RPC
 * trata NULL como "solo registrar 'abierto'" y nunca como aceptacion. Abrir
 * el HTML jamas debe sellar `'aceptado'` — de lo contrario el link
 * "Ver cambios" saltaria el overlay de re-aceptacion. El backend conserva la
 * primera apertura por documento (version `'0.0'` cuando no conoce la vigente).
 *
 * Best-effort: si la RPC falla (sin sesion, error de red), la lectura del
 * documento no debe interrumpirse. Requiere sesion: en el registro (sin
 * usuario) falla silenciosamente y es irrelevante para el funnel.
 */
export async function registrarAperturaLegal(doc: LegalDocLink): Promise<void> {
  try {
    await rpc<ConsentimientoResult>('fn_registrar_consentimiento_legal', {
      p_terminos_version: null,
      p_privacidad_version: null,
      p_opened_terms: doc === 'tyc' ? true : null,
      p_opened_privacy: doc === 'privacidad' ? true : null,
    })
  } catch {
    // best-effort: la apertura no debe bloquear nunca la lectura del doc
  }
}
