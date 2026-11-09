-- Total apartado SÓLO en modalidad virtual, por billetera y moneda.
-- Bajo la regla vigente (la billetera de ORD es el dinero disponible) la billetera
-- YA viene neta de lo apartado, asi que este número no se resta del disponible:
-- es el dato que usa Conciliacion para descontar del saldo del banco lo que sigue
-- fisicamente en la cuenta. La reserva REAL no se descuenta nunca: ese dinero ya
-- salió de la cuenta física.
-- PRD: DF-01, DF-32, §10.3.

CREATE OR REPLACE FUNCTION public.fn_sobres_reservas_virtuales()
 RETURNS TABLE(billetera_id bigint, moneda text, reservado_virtual numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT m.billetera_id,
           m.moneda,
           SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END)
    FROM public.p_sobre_movimientos m
    JOIN public.p_sobres b ON b.sobre_id = m.sobre_id
    WHERE m.user_id = v_user_id
      AND b.archivado_at IS NULL
      AND m.modalidad = 'virtual'
    GROUP BY m.billetera_id, m.moneda
    HAVING SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END) > 0;
END;
$function$;
