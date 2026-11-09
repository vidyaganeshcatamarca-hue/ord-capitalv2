-- Helper interno. Devuelve el producto de ingreso del usuario para los
-- rendimientos de ahorro, creandolo la primera vez. El nombre es la clave de
-- idioma savings_yield_income_name, igual que cat_investments_portfolio.
-- No expuesto al cliente (EXECUTE revocado).

CREATE OR REPLACE FUNCTION public.fn_sobre_producto_rendimiento(p_user_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_producto bigint;
BEGIN
    SELECT producto_id INTO v_producto
    FROM public.p_ingresos
    WHERE user_id = p_user_id AND nombre = 'savings_yield_income_name'
    LIMIT 1;

    IF v_producto IS NULL THEN
        INSERT INTO public.p_ingresos (nombre, descripcion, user_id, icono, color)
        VALUES ('savings_yield_income_name', NULL, p_user_id, 'Percent', '#34D399')
        RETURNING producto_id INTO v_producto;
    END IF;

    RETURN v_producto;
END;
$function$;
