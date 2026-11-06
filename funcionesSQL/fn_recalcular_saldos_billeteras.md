CREATE OR REPLACE FUNCTION public.fn_recalcular_saldos_billeteras()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r_billetera RECORD;
    v_saldo_acumulado numeric;
BEGIN
    FOR r_billetera IN SELECT billetera_id FROM public.p_billeteras LOOP
        -- Calcular sumatoria de ingresos y aperturas
        SELECT COALESCE(SUM(
            CASE 
                -- Ingresos y Aperturas suman al saldo de la cuenta
                WHEN tipo IN ('income', 'opening') THEN valor_ingreso
                -- Ajustes: valor_ingreso suma, valor_egreso resta
                WHEN tipo = 'adjustment' THEN (valor_ingreso - valor_egreso)
                -- Egresos restan del saldo
                WHEN tipo = 'expense' THEN -valor_egreso
                -- Transferencias: restan de origen, suman en destino
                WHEN tipo = 'transfer' AND billetera_origen_id = r_billetera.billetera_id THEN -valor_egreso
                WHEN tipo = 'transfer' AND billetera_destino_id = r_billetera.billetera_id THEN valor_egreso
                ELSE 0
            END
        ), 0) INTO v_saldo_acumulado
        FROM public.p_caja
        WHERE billetera_origen_id = r_billetera.billetera_id 
           OR (tipo = 'transfer' AND billetera_destino_id = r_billetera.billetera_id);
           
        -- Actualizar el saldo actual consolidado de la billetera
        UPDATE public.p_billeteras 
        SET saldo_actual = v_saldo_acumulado 
        WHERE billetera_id = r_billetera.billetera_id;
    END LOOP;
END;
$function$