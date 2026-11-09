-- Porciones vivas de un sobre: de qué billetera salió cada peso y con qué modalidad.
-- Alimenta el rescate multi-origen (DF-05) y el selector de reserva del rendimiento (DF-21).
-- PRD: DF-01 (real/virtual), DF-02 (varias billeteras), DF-03 (modalidad por aporte).

CREATE OR REPLACE FUNCTION public.fn_sobre_porciones(p_sobre_id bigint)
 RETURNS TABLE(billetera_id bigint, billetera_nombre text, moneda text, modalidad text, saldo numeric, genera_rendimiento boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.p_sobres b WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT m.billetera_id,
           w.nombre,
           m.moneda,
           m.modalidad,
           SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END) AS saldo,
           BOOL_OR(m.genera_rendimiento AND m.tipo <> 'rendimiento')
    FROM public.p_sobre_movimientos m
    JOIN public.p_billeteras w ON w.billetera_id = m.billetera_id
    WHERE m.sobre_id = p_sobre_id
    GROUP BY m.billetera_id, w.nombre, m.moneda, m.modalidad
    HAVING SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END) > 0
    ORDER BY 5 DESC, 2;
END;
$function$;
