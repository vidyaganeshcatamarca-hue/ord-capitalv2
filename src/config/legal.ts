/**
 * Versiones de bootstrap de los documentos legales.
 *
 * Fuente de verdad en RUNTIME: `fn_obtener_estado_legal` (tabla
 * `legal_document_version` + log `p_legal_consentimientos`). Este valor solo
 * se usa en dos lugares:
 *   1. Bootstrap del sign-up: `fn_handle_new_user` recibe las versiones en
 *      `options.data` antes de que exista sesión para consultar la RPC
 *      (ver `AuthPage` / `useConsentimientoLegal.registrarConsentimiento`).
 *   2. Fallback sin conexión.
 *
 * Regla de mantenimiento: al publicar una fila nueva en
 * `legal_document_version`, actualizar `LEGAL_VERSIONS` en la MISMA release.
 * El gate de re-aceptación (`LegalUpdateGate`) siempre usa las versiones
 * vigentes que devuelve la RPC, no este archivo.
 */

export const LEGAL_VERSIONS = {
  terminos: '1.1',
  privacidad: '1.1',
} as const

export type LegalDocType = keyof typeof LEGAL_VERSIONS
