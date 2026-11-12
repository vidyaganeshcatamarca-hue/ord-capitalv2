CREATE OR REPLACE FUNCTION public.fn_aviso_cuarentena()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_fila      record;
    v_encolados integer := 0;
    v_id        bigint;
BEGIN
    FOR v_fila IN
        SELECT user_id, COUNT(*)::integer AS pendientes
        FROM public.p_caja_cuarentena
        WHERE estado = 'pendiente'
          AND creado_at <= now() - INTERVAL '24 hours'
        GROUP BY user_id
    LOOP
        v_id := public.fn_encolar_aviso(
            p_user_id    => v_fila.user_id,
            p_tipo       => 'cuarentena_pendiente',
            p_categoria  => 'cuarentena',
            p_metadata   => jsonb_build_object('pendientes', v_fila.pendientes),
            p_prioridad  => 10::smallint,
            p_dedupe_key => 'cuarentena:' || v_fila.pendientes || ':' || to_char(CURRENT_DATE, 'YYYYMMDD'),
            p_expira_at  => (CURRENT_DATE + 1)::timestamptz
        );

        IF v_id IS NOT NULL THEN
            v_encolados := v_encolados + 1;
        END IF;
    END LOOP;

    RETURN v_encolados;
END;
$function$
