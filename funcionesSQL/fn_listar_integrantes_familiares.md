CREATE OR REPLACE FUNCTION public.fn_listar_integrantes_familiares()
 RETURNS TABLE(familiar_id bigint, nombre text, creado_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        gf.familiar_id,
        gf.nombre,
        gf.creado_at
    FROM public.p_grupo_familiar gf
    WHERE gf.user_id = v_user_id
    ORDER BY
        CASE
            WHEN lower(gf.nombre) IN ('personal', 'member_personal') THEN 0
            WHEN lower(gf.nombre) IN ('familiar', 'member_family') THEN 1
            ELSE 2
        END,
        lower(gf.nombre);
END;
$function$
