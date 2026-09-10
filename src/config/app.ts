/**
 * Versión vigente de la app.
 *
 * Single source of truth para el chequeo de versión en cold start
 * (ver `AppVersionGate`, `fn_check_app_version`).
 *
 * Cómo actualizar cuando se publique una nueva versión:
 *   1. Cambiar el valor aquí.
 *   2. (Opcional) Actualizar la política en `p_app_version_policy`
 *      (min_required_version / latest_version / mandatory) vía SQL.
 *   3. Rebuild + deploy.
 *
 * Nota: la versión se controla en tiempo de compilación de forma
 * explícita. NO se deriva de `package.json` ni de Capacitor
 * `App.getInfo()` (que es nativo-only y requeriría un fallback web
 * equivalente a esta misma constante).
 */

export const APP_VERSION = '1.0'
