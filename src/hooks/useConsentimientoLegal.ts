import { rpc } from '@/lib/supabase'
import { LEGAL_VERSIONS } from '@/config/legal'

export type ConsentimientoResult = { ok: boolean }
export type LegalDocLink = 'tyc' | 'privacidad'

/**
 * Registra el consentimiento legal del usuario autenticado.
 *
 * Resuelve identidad via auth.uid() en backend; idempotente (COALESCE
 * preserva el primer timestamp como evidencia legal). Usado en el
 * camino OAuth y como red de seguridad para usuarios con consentimiento
 * NULL. El camino email lo persiste `fn_handle_new_user` desde
 * signUp() options.data.
 *
 * try/catch + async/await (Regla de Oro #13: sin .then().catch()).
 */
export async function registrarConsentimiento(): Promise<ConsentimientoResult> {
  const data = await rpc<ConsentimientoResult>('fn_registrar_consentimiento_legal', {
    p_terminos_version: LEGAL_VERSIONS.terminos,
    p_privacidad_version: LEGAL_VERSIONS.privacidad,
  })
  return data
}

/**
 * Registra la APERTURA de un documento legal (Telemetría Tanda 2).
 *
 * Best-effort: si la RPC falla (sin sesión, error de red), la lectura
 * del documento no debe interrumpirse. Sólo enciende el flag booleano
 * del documento abierto; nunca apaga el opuesto (NULL lo preserva).
 * Requiere sesión: en el registro (sin usuario) falla silenciosamente
 * y es irrelevante para el funnel (funnel gate = usuarios con sesión).
 */
export async function registrarAperturaLegal(doc: LegalDocLink): Promise<void> {
  try {
    await rpc<ConsentimientoResult>('fn_registrar_consentimiento_legal', {
      p_terminos_version: LEGAL_VERSIONS.terminos,
      p_privacidad_version: LEGAL_VERSIONS.privacidad,
      p_opened_terms: doc === 'tyc' ? true : null,
      p_opened_privacy: doc === 'privacidad' ? true : null,
    })
  } catch {
    // best-effort: la apertura no debe bloquear nunca la lectura del doc
  }
}