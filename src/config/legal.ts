/**
 * Versiones vigentes de los documentos legales.
 *
 * Single source of truth para el consentimiento que ORD registra al
 * primer sign-up (ver `useConsentimientoLegal.ts`, `fn_handle_new_user`,
 * `fn_registrar_consentimiento_legal`).
 *
 * Cómo actualizar cuando cambie un documento:
 *   1. Cambiar el valor aquí.
 *   2. Actualizar el HTML correspondiente en `public/legal/`.
 *   3. Rebuild + deploy.
 *
 * Nota: bajo el alcance actual, los usuarios existentes NO se
 * re-promptan al subir versión. Solo nuevos sign-ups reciben la nueva.
 */

export const LEGAL_VERSIONS = {
  terminos: '1.0',
  privacidad: '1.0',
} as const

export type LegalDocType = keyof typeof LEGAL_VERSIONS
