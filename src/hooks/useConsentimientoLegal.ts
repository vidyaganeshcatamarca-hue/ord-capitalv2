import { rpc } from '@/lib/supabase'
import { LEGAL_VERSIONS } from '@/config/legal'

export type ConsentimientoResult = { ok: boolean }

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
