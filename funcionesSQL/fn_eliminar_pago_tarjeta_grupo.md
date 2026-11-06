CREATE OR REPLACE FUNCTION public.fn_eliminar_pago_tarjeta_grupo(p_pago_caja_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_root_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(parent_pago_caja_id, p_pago_caja_id)
      INTO v_root_id
      FROM p_caja
      WHERE p_caja_id = p_pago_caja_id
        AND user_id = v_user_id
        AND tipo = 'pago_tarjeta';

    IF v_root_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_movement_not_found", "params": {}}';
    END IF;

    -- Borrar primero las filas hijas (parent_pago_caja_id = root) de forma inerte.
    -- El trigger fn_t_limpiar_dependencias_caja al verlas no debe revertir (parent_pago_caja_id IS NOT NULL).
    DELETE FROM p_caja
     WHERE user_id = v_user_id
       AND tipo = 'pago_tarjeta'
       AND parent_pago_caja_id = v_root_id;

    -- Borrar la raíz. Ahora SÍ dispara la reversión completa (cuotas, favor, refis)
    -- y la devolución de saldo de billetera via el AFTER trigger.
    DELETE FROM p_caja
     WHERE user_id = v_user_id
       AND tipo = 'pago_tarjeta'
       AND p_caja_id = v_root_id;

    -- Cascada del ajuste de Diferencia Tarjeta asociado al pago raíz.
    -- El trigger fn_t_limpiar_dependencias_caja se dispara, pero como
    -- el tipo es 'adjustment' y no 'pago_tarjeta', no revierte saldo.
    -- billetera_origen_id es NULL para estos ajustes, así que la
    -- reversión de saldo es no-op. El saldo de favor de la tarjeta
    -- tampoco se ve afectado (lo validó el test TDD de la pata 3).
    DELETE FROM p_caja
     WHERE user_id = v_user_id
       AND detalle = 'adjustment_card_diff'
       AND parent_pago_caja_id = v_root_id;
END;
$function$
