-- Helper interno. Saldo con el que arrancó el plan vigente: movimientos anteriores
-- a la fecha de inicio del plan. DF-14: replanificar usa el saldo existente como base.
-- No expuesto al cliente (EXECUTE revocado a anon/authenticated).

CREATE OR REPLACE FUNCTION public.fn_sobre_saldo_base(p_sobre_id bigint, p_inicio date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END), 0)::numeric
    FROM public.p_sobre_movimientos m
    WHERE m.sobre_id = p_sobre_id AND m.fecha < p_inicio;
$function$;
