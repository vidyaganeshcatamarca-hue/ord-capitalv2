CREATE OR REPLACE FUNCTION public.fn_generar_codigo_referido()
 RETURNS TABLE(codigo_referido text, total_invitados bigint, total_suscritos bigint, link_referido text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_codigo_existente TEXT;
    v_codigo_nuevo TEXT;
    v_link_base TEXT := 'https://tuapp.com/ref?code=';
BEGIN
    -- 1. Validar usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Buscar código existente
    SELECT codigo_referido INTO v_codigo_existente
    FROM public.p_referidos
    WHERE user_id_invitador = v_user_id
    LIMIT 1;

    -- 3. Si no existe, generar uno nuevo
    IF v_codigo_existente IS NULL THEN
        -- Formato: REF-{primeras 4 letras nombre}-{4 chars aleatorios}
        SELECT UPPER(
            'REF-' ||
            COALESCE(LEFT(nombre, 4), 'USER') ||
            '-' ||
            UPPER(SUBSTR(MD5(random()::text || clock_timestamp()::text), 1, 4))
        ) INTO v_codigo_nuevo
        FROM public.usuarios
        WHERE user_id = v_user_id;

        INSERT INTO public.p_referidos (
            user_id_invitador, codigo_referido
        ) VALUES (
            v_user_id, v_codigo_nuevo
        );

        v_codigo_existente := v_codigo_nuevo;
    END IF;

    -- 4. Retornar con estadísticas
    RETURN QUERY
    SELECT
        v_codigo_existente,
        COUNT(*) FILTER (WHERE user_id_invitado IS NOT NULL)::BIGINT AS total_invitados,
        COUNT(*) FILTER (WHERE suscrito_premium = true)::BIGINT AS total_suscritos,
        v_link_base || v_codigo_existente AS link_referido
    FROM public.p_referidos
    WHERE user_id_invitador = v_user_id;
END;
$function$