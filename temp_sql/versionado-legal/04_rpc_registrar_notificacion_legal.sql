-- ============================================================================
-- Versionado legal · 04 · fn_registrar_notificacion_legal()
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §4.1 + §5.3
--
-- PROPOSITO
--   Sella el aviso no bloqueante ('notificado') de la version vigente de cada
--   documento. Lo llama el front cuando el usuario cierra el modal combinado
--   ("Continuar", §5.3). Sin parametros de version a proposito: el backend sella
--   la version vigente, que es la que el modal mostro.
--
-- IDEMPOTENCIA
--   Inserta 'notificado' solo si NO existe ya para (user_id, doc_type, version).
--   Llamarla N veces deja exactamente una fila por (usuario, documento, version):
--   el modal no reaparece para esa version.
--
-- NOTA DE SEGURIDAD
--   Un cliente que llame a esta RPC sin haber aceptado no desbloquea nada: en
--   fn_obtener_estado_legal la falta de 'aceptado' de la version vigente manda
--   ('require_acceptance' tiene precedencia sobre 'notify'). El log queda
--   append-only, sin actualizaciones ni borrados.
--
-- CONTRATO DE SALIDA
--   { "ok": true }  (mismo shape que fn_registrar_consentimiento_legal: el front
--   solo necesita saber que la llamada fue aceptada por el backend).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_registrar_notificacion_legal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_doc     text;
    v_version text;
BEGIN
    -- 1. Identidad de la sesion
    SELECT u.user_id INTO v_user_id
      FROM public.usuarios u
     WHERE u.auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Sellar el aviso de la version vigente de cada documento
    FOREACH v_doc IN ARRAY ARRAY['terminos', 'privacidad']::text[] LOOP
        v_version := NULL;

        -- Version vigente: mayor `version` del doc (ver fn_obtener_estado_legal)
        SELECT d.version
          INTO v_version
          FROM public.legal_document_version d
         WHERE d.doc_type = v_doc
           AND NOT EXISTS (
               SELECT 1
                 FROM public.legal_document_version d2
                WHERE d2.doc_type = d.doc_type
                  AND public.fn_compare_versions(d2.version, d.version) > 0)
         ORDER BY d.effective_at DESC, d.created_at DESC
         LIMIT 1;

        IF v_version IS NOT NULL THEN
            -- Idempotente: solo si el evento no existe para esa version
            INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
            SELECT v_user_id, v_doc, 'notificado', v_version
             WHERE NOT EXISTS (
                 SELECT 1
                   FROM public.p_legal_consentimientos c
                  WHERE c.user_id  = v_user_id
                    AND c.doc_type = v_doc
                    AND c.evento   = 'notificado'
                    AND c.version  = v_version);
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

COMMENT ON FUNCTION public.fn_registrar_notificacion_legal() IS
    'Sella el evento notificado de la version vigente de terminos y privacidad. Idempotente por (user_id, doc_type, version).';

REVOKE ALL ON FUNCTION public.fn_registrar_notificacion_legal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_notificacion_legal() TO authenticated;

NOTIFY pgrst, 'reload schema';
