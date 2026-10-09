-- ============================================================================
-- Versionado legal · 06 · RPCs modificadas (motor interno pasa al log)
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §4.2
--
-- REGLA DE ESTE ARCHIVO: el CONTRATO DE SALIDA de las 4 funciones NO cambia.
-- Solo cambia de donde sale el estado: columnas de `usuarios` -> log
-- p_legal_consentimientos. Todo lo que no toca el dominio legal queda intacto.
--
--   1. fn_registrar_consentimiento_legal  (misma firma; + 'aceptado'/'abierto')
--   2. fn_verificar_status_onboarding     (mismo JSON; consent = EXISTS aceptado)
--   3. fn_handle_new_user                 (trigger; eventos en lugar de columnas)
--   4. fn_admin_funnel_onboarding         (mismo JSON; 'abierto'/'aceptado' del log)
--
-- ORDEN DE APLICACION: esta tanda va ANTES del bloque de DROP de columnas de
-- 07_backfill_semillas.sql. Ninguna de estas 4 funciones puede quedar leyendo o
-- escribiendo las columnas legales de `usuarios` en el momento del drop.
-- ============================================================================


-- ============================================================================
-- 1. fn_registrar_consentimiento_legal  (motor interno -> log)
-- ============================================================================
-- Traduccion 1:1 de la semantica actual:
--   ANTES: UPDATE usuarios SET consentimiento_legal_at = COALESCE(...,now()),
--          terminos/privacidad_version_aceptada = p_*,
--          opened_terms/privacy = COALESCE(p_opened_*, columna)
--   AHORA: 'aceptado' por doc/version + 'abierto' por doc (solo la primera vez)
--
--   - 'aceptado' es idempotente por (user_id, doc_type, version): re-aceptar la
--     misma version no infla el log (equivale al COALESCE del timestamp legal).
--   - 'abierto' se inserta SOLO si no existe previo para (user_id, doc_type),
--     igual que el COALESCE actual de opened_terms/opened_privacy.
--   - Guardas de NULL/'' : si una version viene vacia NO se inserta el evento
--     (fail-safe: sin 'aceptado' el estado sigue siendo require_acceptance) y la
--     funcion sigue devolviendo {ok:true}, igual que antes no rompia.
--
-- ⚠️ AVISO DE DISENO — PENDIENTE DE DECISION DEL DUENO ANTES DEL DEPLOY
--   El front llama a esta MISMA RPC por dos caminos
--   (src/hooks/useConsentimientoLegal.ts):
--     registrarConsentimiento()      -> solo versiones        = aceptacion real
--     registrarAperturaLegal(doc)    -> versiones + p_opened_*=true
--                                       (LegalDocModal al abrir el HTML) = solo apertura
--   El camino de apertura TAMBIEN manda las versiones, asi que la traduccion 1:1
--   registra 'aceptado' al abrir un documento. Hoy eso ya pasa con las columnas
--   (fail-open silencioso); con el overlay bloqueante nuevo permitiria saltear
--   la re-aceptacion con un click en "Ver cambios". Opciones para el dueno:
--     (a) dejar 1:1 como hoy  -> el hueco sigue existiendo, ahora con mas impacto
--     (b) el front deja de mandar las versiones en el camino de apertura (Tanda 2)
--     (c) RPC dedicada fn_registrar_apertura_legal(p_doc_type) -> objeto nuevo,
--         requiere aprobacion aparte
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_consentimiento_legal(
  p_terminos_version text,
  p_privacidad_version text,
  p_opened_terms boolean DEFAULT NULL,
  p_opened_privacy boolean DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  -- Identidad de la sesion (misma resolucion que antes)
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  -- 1. Evidencia de aceptacion: Terminos
  IF NULLIF(p_terminos_version, '') IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    SELECT v_user_id, 'terminos', 'aceptado', p_terminos_version
     WHERE NOT EXISTS (
         SELECT 1 FROM public.p_legal_consentimientos c
          WHERE c.user_id = v_user_id
            AND c.doc_type = 'terminos'
            AND c.evento = 'aceptado'
            AND c.version = p_terminos_version);
  END IF;

  -- 2. Evidencia de aceptacion: Privacidad
  IF NULLIF(p_privacidad_version, '') IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    SELECT v_user_id, 'privacidad', 'aceptado', p_privacidad_version
     WHERE NOT EXISTS (
         SELECT 1 FROM public.p_legal_consentimientos c
          WHERE c.user_id = v_user_id
            AND c.doc_type = 'privacidad'
            AND c.evento = 'aceptado'
            AND c.version = p_privacidad_version);
  END IF;

  -- 3. Apertura del documento: Terminos (una sola fila por doc, la primera vez).
  --    Version del evento = la version vigente que el gate esta mostrando.
  IF COALESCE(p_opened_terms, false) AND NOT EXISTS (
      SELECT 1 FROM public.p_legal_consentimientos c
       WHERE c.user_id = v_user_id
         AND c.doc_type = 'terminos'
         AND c.evento = 'abierto') THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'terminos', 'abierto',
            COALESCE(NULLIF(p_terminos_version, ''), '0.0'));
  END IF;

  -- 4. Apertura del documento: Privacidad
  IF COALESCE(p_opened_privacy, false) AND NOT EXISTS (
      SELECT 1 FROM public.p_legal_consentimientos c
       WHERE c.user_id = v_user_id
         AND c.doc_type = 'privacidad'
         AND c.evento = 'abierto') THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'privacidad', 'abierto',
            COALESCE(NULLIF(p_privacidad_version, ''), '0.0'));
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

COMMENT ON FUNCTION public.fn_registrar_consentimiento_legal(text, text, boolean, boolean) IS
    'Registra eventos legales del usuario autenticado en p_legal_consentimientos: aceptado (por version, idempotente) y abierto (una sola vez por documento). Retorna {ok:true}.';


-- ============================================================================
-- 2. fn_verificar_status_onboarding  (mismo JSON, fuente del consent = log)
-- ============================================================================
-- Unico cambio interno: el check de consentimiento pasa de
-- usuarios.consentimiento_legal_at a EXISTS sobre p_legal_consentimientos con
-- evento='aceptado' (sin acotar por version: equivale al "hay consentimiento" de
-- la columna, §4.2 del spec). El JSON de salida queda identico:
--   { onboarding_completo, tiene_billeteras, tiene_config, consentimiento_aceptado }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_verificar_status_onboarding()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_has_wallets boolean;
    v_has_config boolean;
    v_consentimiento_aceptado boolean;
BEGIN
    -- 1. Comprobación del token y obtención del user_id bigint
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Verificar si tiene al menos una billetera activa
    SELECT EXISTS (
        SELECT 1 FROM public.p_billeteras WHERE user_id = v_user_id
    ) INTO v_has_wallets;

    -- 3. Verificar si existe configuración de presupuestos
    SELECT EXISTS (
        SELECT 1 FROM public.p_presupuestos_config WHERE user_id = v_user_id
    ) INTO v_has_config;

    -- 4. Verificar si aceptó el consentimiento legal
    --    (fuente nueva: log append-only; antes usuarios.consentimiento_legal_at)
    SELECT EXISTS (
        SELECT 1 FROM public.p_legal_consentimientos c
         WHERE c.user_id = v_user_id
           AND c.evento = 'aceptado'
    ) INTO v_consentimiento_aceptado;

    -- 5. Retornar un JSON con los estados detallados
    RETURN jsonb_build_object(
        'onboarding_completo', (v_has_wallets AND v_has_config),
        'tiene_billeteras', v_has_wallets,
        'tiene_config', v_has_config,
        'consentimiento_aceptado', v_consentimiento_aceptado
    );
END;
$function$;


-- ============================================================================
-- 3. fn_handle_new_user  (trigger auth.users -> usuarios + eventos iniciales)
-- ============================================================================
-- En el sign-up los eventos 'aceptado' se insertan desde options.data
-- (raw_user_meta_data->>'terminos_version' / 'privacidad_version'), la MISMA
-- fuente que hoy alimenta terminos_version_aceptada / privacidad_version_aceptada
-- y que define si el consentimiento inicial queda registrado (antes:
-- consentimiento_legal_at solo si terminos_version venia no vacia).
--
-- La fila de `usuarios` deja de recibir las columnas legales (se eliminan en 07).
-- Cambio de robustez: se agrega SET search_path TO 'public' (el cuerpo ya estaba
-- totalmente calificado; SECURITY DEFINER sin search_path queda expuesto a un
-- search_path manipulado por el llamador).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     bigint;
  v_terminos    text := NULLIF(NEW.raw_user_meta_data->>'terminos_version', '');
  v_privacidad  text := NULLIF(NEW.raw_user_meta_data->>'privacidad_version', '');
BEGIN
  -- 1. Alta del usuario (mismo INSERT de siempre, sin columnas legales)
  INSERT INTO public.usuarios (
    auth_id,
    nombre,
    email,
    login,
    password
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'nombre', 'Usuario Sin Nombre'),
    NEW.email,
    NEW.email,
    'supabase_auth'
  )
  RETURNING user_id INTO v_user_id;

  -- 2. Evidencia legal inicial (equivalente a las columnas *_version_aceptada)
  IF v_terminos IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'terminos', 'aceptado', v_terminos);
  END IF;

  IF v_privacidad IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'privacidad', 'aceptado', v_privacidad);
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 4. fn_admin_funnel_onboarding  (mismo JSON, pasos legales desde el log)
-- ============================================================================
-- El contrato de salida queda intacto: mismas claves, mismo shape, mismos
-- `paso`, mismos `origen`, mismo timing y mismos filtros de cohorte/ventana.
-- Cambios internos:
--   - 2_abrio_terminos / 3_abrio_privacy -> EXISTS 'abierto' del doc en el log
--   - 4_acepto                           -> EXISTS 'aceptado' de 'terminos'
--         (mapeo fiel: la columna consentimiento_legal_at se setea cuando viene
--          terminos_version; el consentimiento de privacidad no la movia)
--   - 5_acepto_sin_abrir                 -> aceptado AND NOT abierto(terminos) AND NOT abierto(privacidad)
--   - 6_abandono                         -> NOT aceptado AND last_session_at IS NOT NULL
--   - meta.notas: se actualizan 2 textos que quedaban falsos (decir que los
--     eventos del gate legal "no estan instrumentados" ya no es cierto). Claves
--     y cantidad de notas identicas; es texto informativo que muestra el panel.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_admin_funnel_onboarding(
    p_desde        timestamptz DEFAULT now() - interval '90 days',
    p_hasta        timestamptz DEFAULT now(),
    p_app_version  text DEFAULT NULL,   -- reservado: el funnel es por cohorte
    p_platform     text DEFAULT NULL,   -- reservado: idem
    p_plan         text DEFAULT NULL,   -- reservado: decision ④
    p_cohorte      text DEFAULT NULL    -- 'YYYY-MM' refina la ventana de alta
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_result  jsonb;
    v_tz      constant text := 'America/Argentina/Buenos_Aires';
BEGIN
    v_session := public.fn_admin_session();

    IF p_desde > p_hasta THEN
        RAISE EXCEPTION '{"key": "error_invalid_range", "params": {}}';
    END IF;

    WITH cohorte AS (
        SELECT u.user_id,
               u.creado_at,
               u.last_session_at
        FROM public.usuarios u
        WHERE u.deleted_at IS NULL
          AND u.creado_at >= p_desde AND u.creado_at <= p_hasta
          AND (p_cohorte IS NULL
               OR to_char(u.creado_at AT TIME ZONE v_tz, 'YYYY-MM') = p_cohorte)
    ),
    senales AS (
        SELECT c.user_id,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'abierto')                AS abrio_terminos,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'privacidad'
                          AND l.evento = 'abierto')                AS abrio_privacy,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'aceptado')               AS acepto,
               (r.creado_at IS NOT NULL)                        AS inicio_setup,
               (coalesce(m.active_wallet_count,0) > 0)         AS tiene_billetera,
               (pc.user_id IS NOT NULL)                        AS config_budjet,
               EXISTS (SELECT 1 FROM public.p_billeteras b
                        WHERE b.user_id = c.user_id
                          AND b.saldo_inicial_pendiente)       AS saldo_pendiente,
               (x.primer_mov IS NOT NULL)                      AS hay_movimiento,
               x.primer_mov,
               c.last_session_at
        FROM cohorte c
        LEFT JOIN public.p_config_region r ON r.user_id = c.user_id
        LEFT JOIN public.p_presupuestos_config pc ON pc.user_id = c.user_id
        LEFT JOIN public.p_telemetry_user_metrics m ON m.user_id = c.user_id
        LEFT JOIN (SELECT user_id, min(fecha)::timestamptz AS primer_mov
                     FROM public.p_caja
                    WHERE tipo IN ('expense','income','transfer')
                    GROUP BY user_id) x ON x.user_id = c.user_id
    ),
    paso AS (
        SELECT '1_alta'                      AS paso, count(*)                          AS n, 'estado'       AS origen FROM senales
        UNION ALL
        SELECT '2_abrio_terminos',            count(*) FILTER (WHERE abrio_terminos),  'estado'       FROM senales
        UNION ALL
        SELECT '3_abrio_privacy',             count(*) FILTER (WHERE abrio_privacy),   'estado'       FROM senales
        UNION ALL
        SELECT '4_acepto',                    count(*) FILTER (WHERE acepto),          'estado'       FROM senales
        UNION ALL
        SELECT '5_acepto_sin_abrir',          count(*) FILTER (WHERE acepto AND NOT abrio_terminos AND NOT abrio_privacy), 'estado' FROM senales
        UNION ALL
        SELECT '6_abandono',                  count(*) FILTER (WHERE NOT acepto AND last_session_at IS NOT NULL), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '7_onboarding_iniciado',       count(*) FILTER (WHERE inicio_setup),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '8_billetera_principal',       count(*) FILTER (WHERE tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '9_saldo_inicial',             count(*) FILTER (WHERE tiene_billetera AND NOT saldo_pendiente), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '10_dia_ancla',                count(*) FILTER (WHERE config_budjet),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '11_onboarding_completado',    count(*) FILTER (WHERE inicio_setup AND tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '12_primer_movimiento',          count(*) FILTER (WHERE hay_movimiento),  'estado'       FROM senales
    )
    SELECT jsonb_build_object(
        'cohort', jsonb_build_object(
            'desde', p_desde, 'hasta', p_hasta,
            'usuarios_alta', (SELECT count(*) FROM cohorte)),
        'pasos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'paso',   p.paso,
                       'usuarios', p.n,
                       'origen', p.origen,
                       'pct_alta', round(100.0 * p.n / NULLIF((SELECT count(*) FROM cohorte),0), 1),
                       'pct_previo', NULL  -- el orden no es estrictamente lineal;
                                             -- la UI muestra cada paso vs alta
                   ) ORDER BY split_part(p.paso, '_', 1)::int)
            FROM paso p), '[]'::jsonb),
        'timing_primer_movimiento', jsonb_build_object(
            'nota', 'dias entre alta y primer movimiento; negativos = movimientos con fecha anterior al alta (legado/historico)',
            'p50_dias', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL),
            'p50_dias_post_alta', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               >= (c.creado_at AT TIME ZONE v_tz)::date),
            'n_movimientos_pre_alta', (SELECT count(*)
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               < (c.creado_at AT TIME ZONE v_tz)::date),
            'origen', 'estado'),
        'meta', jsonb_build_object(
            'admin', v_session ->> 'email',
            'notas', jsonb_build_array(
                'funnel_mixto_pasos_legales_desde_log_de_eventos_resto_derivado_de_estado',
                'p_legal_consentimientos_instrumentado_desde_esta_version',
                'los_pasos_con_origen_estado_proxy_no_son_eventos_reales',
                'el_paso_6_abandono_es_abrieron_sin_aceptar_legal',
                'orden_de_pasos_numeric_no_lexicografico'))
    ) INTO v_result;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_funnel_onboarding',
            v_session ->> 'email',
            'ok',
            jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'cohorte', p_cohorte));

    RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
