-- Helper interno. Saldo vivo de un sobre: aportes + rendimientos - rescates.
-- No expuesto al cliente (EXECUTE revocado a anon/authenticated): sólo lo llaman las RPCs.
-- PRD: DF-32 (apartar no es gasto, el patrimonio se conserva).

CREATE OR REPLACE FUNCTION public.fn_sobre_saldo(p_sobre_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END), 0)::numeric
    FROM public.p_sobre_movimientos m
    WHERE m.sobre_id = p_sobre_id;
$function$;
