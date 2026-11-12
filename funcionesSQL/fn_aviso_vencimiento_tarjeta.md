CREATE OR REPLACE FUNCTION public.fn_aviso_vencimiento_tarjeta()
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
        SELECT t.user_id,
               COUNT(*)::integer        AS tarjetas,
               MIN(t.dias)::integer     AS dias_mas_cercano,
               SUM(t.monto)             AS monto_pendiente
        FROM (
            SELECT tc.user_id,
                   GREATEST(
                       CASE
                           WHEN EXTRACT(DAY FROM CURRENT_DATE) <= tc.dia_vencimiento
                           THEN tc.dia_vencimiento - EXTRACT(DAY FROM CURRENT_DATE)
                           ELSE EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))
                                - EXTRACT(DAY FROM CURRENT_DATE) + tc.dia_vencimiento
                       END, 0)::integer AS dias,
                   (SELECT COALESCE(SUM(cd.monto_cuota), 0)
                      FROM public.p_cuotas_detalle cd
                     WHERE cd.tarjeta_id = tc.tarjeta_id
                       AND cd.pagado = false
                       AND cd.fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days') AS monto
            FROM public.p_tarjetas_credito tc
            WHERE tc.dia_vencimiento IS NOT NULL
        ) t
        WHERE t.monto > 0
          AND t.dias <= 3
        GROUP BY t.user_id
    LOOP
        v_id := public.fn_encolar_aviso(
            p_user_id    => v_fila.user_id,
            p_tipo       => 'vencimiento_tarjeta',
            p_categoria  => 'vencimientos',
            p_metadata   => jsonb_build_object(
                                'tarjetas', v_fila.tarjetas,
                                'dias_mas_cercano', v_fila.dias_mas_cercano,
                                'monto_pendiente', v_fila.monto_pendiente),
            p_prioridad  => 10::smallint,
            p_dedupe_key => 'vencimiento_tarjeta:' || to_char(CURRENT_DATE, 'YYYYMMDD'),
            p_expira_at  => (CURRENT_DATE + 1)::timestamptz
        );

        IF v_id IS NOT NULL THEN
            v_encolados := v_encolados + 1;
        END IF;
    END LOOP;

    RETURN v_encolados;
END;
$function$
