-- ============================================================================
-- Versionado legal · 03 · fn_obtener_estado_legal()
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §4.1 (+ §5 flujo UI)
--
-- PROPOSITO
--   Estado legal del usuario autenticado en UNA llamada al arranque de sesion.
--   El backend calcula el `pending_action` por documento y el front solo pinta
--   (§5: overlay bloqueante / modal no bloqueante / nada).
--
--   Contrato de salida (exacto, §4.1):
--     {
--       "terminos":   { "current_version": "1.1", "requires_acceptance": false,
--                       "requires_notification": true, "pending_action": "notify" },
--       "privacidad": { ... }
--     }
--
-- DERIVACION DE pending_action (por documento)
--   1. Sin NINGUN evento 'aceptado' del doc (cualquier version) -> 'require_acceptance'
--      (fallo seguro: nunca queda desbloqueado por aviso).
--   2. Vigente con requires_acceptance = true y sin evento 'aceptado' de la version
--      vigente                                     -> 'require_acceptance'
--      (el guard de la version permite el rollout 1.1: aceptados de 1.0 con 1.1
--       no bloqueante caen en notify/none, per spec §3.5 / decision 7).
--   3. requires_notification = true y sin evento 'notificado' de la version vigente
--                                                   -> 'notify'
--   4. Caso contrario                               -> 'none'
--   5. Defensivo: doc sin fila publicada -> current_version null y 'none'.
--
-- VERSION VIGENTE
--   La mayor `version` del doc segun fn_compare_versions (no orden lexicografico:
--   '1.10' > '1.9'), con desempate por effective_at/created_at mas recientes.
--   effective_at es informativa en esta release (ver comentario en 01).
--
-- ACCESO: cualquier usuario autenticado. Resuelve identidad con auth.uid()
--   (misma resolucion que el resto de las RPCs de usuario).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_obtener_estado_legal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id         bigint;
    v_doc             text;
    v_version         text;
    v_requires_accept boolean;
    v_requires_notify boolean;
    v_pending         text;
    v_result          jsonb := '{}'::jsonb;
BEGIN
    -- 1. Identidad de la sesion
    SELECT u.user_id INTO v_user_id
      FROM public.usuarios u
     WHERE u.auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Estado por documento (el orden de armado no importa: jsonb no lo preserva)
    FOREACH v_doc IN ARRAY ARRAY['terminos', 'privacidad']::text[] LOOP
        -- 2.1 Version vigente del documento
        SELECT d.version, d.requires_acceptance, d.requires_notification
          INTO v_version, v_requires_accept, v_requires_notify
          FROM public.legal_document_version d
         WHERE d.doc_type = v_doc
           AND NOT EXISTS (
               SELECT 1
                 FROM public.legal_document_version d2
                WHERE d2.doc_type = d.doc_type
                  AND public.fn_compare_versions(d2.version, d.version) > 0)
         ORDER BY d.effective_at DESC, d.created_at DESC
         LIMIT 1;

        -- 2.2 Nivel de politica de la version vigente (backend calcula, front pinta)
        IF v_version IS NULL THEN
            -- Defensivo: documento sin ninguna version publicada.
            v_pending := 'none';
        ELSIF NOT EXISTS (
            -- Fallo seguro: sin NINGUN evento 'aceptado' del doc (cualquier
            -- version) siempre bloquea; nunca se desbloquea por notificacion.
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'aceptado') THEN
            v_pending := 'require_acceptance';
        ELSIF COALESCE(v_requires_accept, false)
              AND NOT EXISTS (
            -- Solo bloquea si la version vigente lo requiere. Versiones con
            -- requires_acceptance = false (ej. rollout 1.1 sobre aceptados de
            -- 1.0) caen en notify/none, nunca en bloqueo.
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'aceptado'
               AND c.version  = v_version) THEN
            v_pending := 'require_acceptance';
        ELSIF COALESCE(v_requires_notify, false)
              AND NOT EXISTS (
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'notificado'
               AND c.version  = v_version) THEN
            v_pending := 'notify';
        ELSE
            v_pending := 'none';
        END IF;

        -- 2.3 Bloque del documento
        v_result := v_result || jsonb_build_object(v_doc, jsonb_build_object(
            'current_version',       v_version,
            'requires_acceptance',   COALESCE(v_requires_accept, false),
            'requires_notification', COALESCE(v_requires_notify, false),
            'pending_action',        v_pending));
    END LOOP;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.fn_obtener_estado_legal() IS
    'Estado legal del usuario autenticado (version vigente + flags + pending_action por documento). Fuente: legal_document_version + p_legal_consentimientos.';

REVOKE ALL ON FUNCTION public.fn_obtener_estado_legal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_obtener_estado_legal() TO authenticated;

NOTIFY pgrst, 'reload schema';
