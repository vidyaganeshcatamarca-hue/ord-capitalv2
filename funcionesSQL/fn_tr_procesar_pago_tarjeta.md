CREATE OR REPLACE FUNCTION public.fn_tr_procesar_pago_tarjeta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_detalle text;
BEGIN
    -- Solo pagos de resumen con tarjeta; los aportes split inertes y los
    -- multi ('card_summary_payment_multi') no disparan liquidaciÃÂ³n.
    IF NEW.tipo = 'pago_tarjeta' AND NEW.tarjeta_id IS NOT NULL THEN
        SELECT detalle INTO v_detalle FROM p_caja WHERE p_caja_id = NEW.p_caja_id;
        IF v_detalle = 'card_summary_payment_split'
           OR v_detalle = 'card_summary_payment_multi'
           OR v_detalle = 'card_summary_payment_favor' THEN
            RETURN NEW;  -- aporte lÃ­nea 2..N, lÃ­nea 1 de multi, o lÃ­nea de saldo a favor: inerte
        END IF;

        PERFORM fn_liquidar_ciclo_tarjeta(
            NEW.tarjeta_id,
            NEW.user_id,
            NEW.fecha,
            NEW.valor_egreso,
            NEW.p_caja_id
        );
    END IF;
    RETURN NEW;
END;
$function$

