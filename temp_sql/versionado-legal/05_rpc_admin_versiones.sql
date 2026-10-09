-- ============================================================================
-- Versionado legal · 05 · RPCs del panel ORD Admin
--   fn_admin_legal_versiones_listar()
--   fn_admin_legal_version_publicar(...)
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §4.1 + §6 (regla de releases)
--
-- REPLICA DEL PATRON ADMIN (ord-admin/admin/sql)
--   - Gate fn_admin_session() como PRIMERA linea (identidad via admin_usuarios:
--     viewer|admin; audita ok/denied). Sin JWT -> error_unauthorized sin auditar.
--   - Escritura: ROL 'admin' estricto (viewer -> error_admin_only) + kill-switch
--     fn_admin_escritura_habilitada() (false -> error_admin_write_disabled).
--   - Auditoria en admin_audit_log (accion, admin_caller, resultado, parametros).
--   - SIN STABLE: fn_admin_session() escribe; STABLE rompe con 405 via PostgREST.
--   - Errores SIEMPRE con el contrato JSON {"key": "...", "params": {...}}.
--
-- NOTA DE FUENTE
--   Estas dos RPCs pertenecen al panel (repo ord-admin). Este archivo es la
--   propuesta para el deploy; tras el OK del dueno corresponde espejar el SQL
--   fuente en ord-admin/admin/sql/ y el espejo .md en funcionesSQL/.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Listado del catalogo de versiones + conteos de aceptacion/aviso
--    Contrato: { versiones: [...], meta: { admin, escritura_habilitada } }
--      versiones[]: doc_type, version, requires_acceptance, requires_notification,
--                    effective_at, created_at, es_vigente,
--                    usuarios_aceptado, usuarios_notificado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admin_legal_versiones_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_result  jsonb;
BEGIN
    v_session := public.fn_admin_session();

    WITH vigente AS (
        -- Version vigente por doc: mayor `version` segun fn_compare_versions
        SELECT d.doc_type, d.version
          FROM public.legal_document_version d
         WHERE NOT EXISTS (
             SELECT 1
               FROM public.legal_document_version d2
              WHERE d2.doc_type = d.doc_type
                AND public.fn_compare_versions(d2.version, d.version) > 0)
    ),
    conteos AS (
        SELECT c.doc_type, c.version,
               count(*) FILTER (WHERE c.evento = 'aceptado')   AS usuarios_aceptado,
               count(*) FILTER (WHERE c.evento = 'notificado') AS usuarios_notificado
          FROM public.p_legal_consentimientos c
         GROUP BY c.doc_type, c.version
    )
    SELECT jsonb_build_object(
        'versiones', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'doc_type',              v.doc_type,
                       'version',               v.version,
                       'requires_acceptance',   v.requires_acceptance,
                       'requires_notification', v.requires_notification,
                       'effective_at',          v.effective_at::text,
                       'created_at',            v.created_at::text,
                       'es_vigente',            (g.version IS NOT NULL),
                       'usuarios_aceptado',     COALESCE(k.usuarios_aceptado, 0),
                       'usuarios_notificado',   COALESCE(k.usuarios_notificado, 0))
                   ORDER BY v.doc_type, v.effective_at DESC, v.created_at DESC)
              FROM public.legal_document_version v
              LEFT JOIN vigente g ON g.doc_type = v.doc_type AND g.version = v.version
              LEFT JOIN conteos k ON k.doc_type = v.doc_type AND k.version = v.version),
            '[]'::jsonb),
        'meta', jsonb_build_object(
            'admin', v_session ->> 'email',
            'escritura_habilitada', public.fn_admin_escritura_habilitada()))
      INTO v_result;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_legal_versiones_listar',
            v_session ->> 'email',
            'ok',
            jsonb_build_object('versiones', jsonb_array_length(v_result -> 'versiones')));

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_admin_legal_versiones_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_legal_versiones_listar() TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Publicacion de una version (UPSERT de la fila del catalogo)
--    Validaciones:
--      - doc_type en ('terminos','privacidad')           -> error_valor_invalido
--      - version con formato x.y[.z]                     -> error_valor_invalido
--      - version menor que la vigente                    -> error_legal_version_downgrade
--      - re-publicar una version vigente con otros flags-> error_legal_version_immutable
--    Re-publicar la version vigente con los MISMOS flags es un noop sin write
--    ni auditoria (mismo criterio que fn_admin_config_guardar).
--
--    REGLA DE RELEASE (§6): el deploy del HTML va PRIMERO; esta RPC se llama
--    despues, en la misma release. Nunca publicar una fila con el HTML sin deployar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admin_legal_version_publicar(
    p_doc_type              text,
    p_version               text,
    p_requires_acceptance   boolean,
    p_requires_notification boolean,
    p_effective_at          timestamptz DEFAULT now()
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_actual  public.legal_document_version%ROWTYPE;
    v_regex   text := '^[0-9]+(\.[0-9]+){0,2}$';
    v_accept  boolean;
    v_notify  boolean;
    v_eff     timestamptz;
BEGIN
    v_session := public.fn_admin_session();

    IF (v_session ->> 'rol') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION '{"key": "error_admin_only", "params": {}}';
    END IF;

    IF NOT public.fn_admin_escritura_habilitada() THEN
        RAISE EXCEPTION '{"key": "error_admin_write_disabled", "params": {}}';
    END IF;

    -- Validacion de entrada: mismo regex de version que fn_admin_policy_guardar
    -- (ademas protege el cast interno de fn_compare_versions).
    IF p_doc_type IS NULL OR p_doc_type NOT IN ('terminos', 'privacidad') THEN
        RAISE EXCEPTION '{"key": "error_valor_invalido", "params": {"campo": "doc_type"}}';
    END IF;

    IF p_version IS NULL OR p_version !~ v_regex THEN
        RAISE EXCEPTION '{"key": "error_valor_invalido", "params": {"campo": "version"}}';
    END IF;

    v_accept := COALESCE(p_requires_acceptance, false);
    v_notify := COALESCE(p_requires_notification, false);
    v_eff    := COALESCE(p_effective_at, now());

    -- Version vigente del documento (ver fn_obtener_estado_legal)
    SELECT d.* INTO v_actual
      FROM public.legal_document_version d
     WHERE d.doc_type = p_doc_type
       AND NOT EXISTS (
           SELECT 1
             FROM public.legal_document_version d2
            WHERE d2.doc_type = d.doc_type
              AND public.fn_compare_versions(d2.version, d.version) > 0)
     ORDER BY d.effective_at DESC, d.created_at DESC
     LIMIT 1;

    IF FOUND THEN
        -- Downgrade: la version nueva debe ser mayor que la vigente
        IF public.fn_compare_versions(p_version, v_actual.version) < 0 THEN
            RAISE EXCEPTION '{"key": "error_legal_version_downgrade", "params": {}}';
        END IF;

        -- Republicar la version vigente: los flags son inmutables
        IF public.fn_compare_versions(p_version, v_actual.version) = 0 THEN
            IF v_accept IS DISTINCT FROM v_actual.requires_acceptance
               OR v_notify IS DISTINCT FROM v_actual.requires_notification THEN
                RAISE EXCEPTION '{"key": "error_legal_version_immutable", "params": {}}';
            END IF;

            -- Noop: sin write ni auditoria
            RETURN jsonb_build_object(
                'ok', true,
                'cambio', false,
                'doc_type', p_doc_type,
                'version', p_version,
                'requires_acceptance', v_actual.requires_acceptance,
                'requires_notification', v_actual.requires_notification,
                'effective_at', v_actual.effective_at);
        END IF;
    END IF;

    INSERT INTO public.legal_document_version (
        doc_type, version, requires_acceptance, requires_notification, effective_at
    ) VALUES (
        p_doc_type, p_version, v_accept, v_notify, v_eff
    );

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_legal_version_publicar',
            v_session ->> 'email',
            'ok',
            jsonb_build_object(
                'doc_type', p_doc_type,
                'version', p_version,
                'requires_acceptance', v_accept,
                'requires_notification', v_notify,
                'effective_at', v_eff,
                'version_anterior', v_actual.version));

    RETURN jsonb_build_object(
        'ok', true,
        'cambio', true,
        'doc_type', p_doc_type,
        'version', p_version,
        'requires_acceptance', v_accept,
        'requires_notification', v_notify,
        'effective_at', v_eff);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_admin_legal_version_publicar(text, text, boolean, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_legal_version_publicar(text, text, boolean, boolean, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
