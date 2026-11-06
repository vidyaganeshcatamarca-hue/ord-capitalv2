CREATE OR REPLACE FUNCTION public.fn_generar_codigo_invitacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_codigo text;
    v_expira timestamp with time zone;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id
    FROM p_hogar_participantes
    WHERE user_id = v_user_id
      AND rol = 'creador';

    IF v_hogar_id IS NULL THEN
        INSERT INTO p_hogares (
            porcentaje_usuario_creador,
            porcentaje_usuario_invitado
        )
        VALUES (50, 50)
        RETURNING hogar_id INTO v_hogar_id;

        INSERT INTO p_hogar_participantes (hogar_id, user_id, rol)
        VALUES (v_hogar_id, v_user_id, 'creador');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM p_hogar_participantes
        WHERE hogar_id = v_hogar_id
          AND rol = 'invitado'
    ) THEN
        RAISE EXCEPTION '{"key": "error_home_already_has_partner", "params": {}}';
    END IF;

    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    v_expira := now() + INTERVAL '7 days';

    UPDATE p_hogar_invitaciones
    SET expira_at = now()
    WHERE hogar_id = v_hogar_id
      AND usada = false;

    INSERT INTO p_hogar_invitaciones (hogar_id, codigo, creado_por_user_id, expira_at)
    VALUES (v_hogar_id, v_codigo, v_user_id, v_expira);

    RETURN jsonb_build_object(
        'codigo', v_codigo,
        'expira_at', v_expira
    );
END;
$function$
