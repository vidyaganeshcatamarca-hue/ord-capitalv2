CREATE OR REPLACE FUNCTION public.fn_aviso_deuda_por_vencer()
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
        SELECT user_id,
               COUNT(*)::integer AS deudas,
               MIN(proximo_vencimiento - CURRENT_DATE)::integer AS dias_mas_cercano,
               SUM(COALESCE(saldo_actual, 0)) AS saldo_pendiente
        FROM public.p_prestamos
        WHERE estado IN ('activo', 'pendiente', 'parcial')
          AND proximo_vencimiento IS NOT NULL
          AND proximo_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        GROUP BY user_id
    LOOP
        v_id := public.fn_encolar_aviso(
            p_user_id    => v_fila.user_id,
            p_tipo       => 'deuda_por_vencer',
            p_categoria  => 'deuda',
            p_metadata   => jsonb_build_object(
                                'deudas', v_fila.deudas,
                                'dias_mas_cercano', v_fila.dias_mas_cercano,
                                'saldo_pendiente', v_fila.saldo_pendiente),
            p_prioridad  => 15::smallint,
            p_dedupe_key => 'deuda_por_vencer:' || to_char(CURRENT_DATE, 'YYYYMMDD'),
            p_expira_at  => (CURRENT_DATE + 1)::timestamptz
        );

        IF v_id IS NOT NULL THEN
            v_encolados := v_encolados + 1;
        END IF;
    END LOOP;

    RETURN v_encolados;
END;
$function$
