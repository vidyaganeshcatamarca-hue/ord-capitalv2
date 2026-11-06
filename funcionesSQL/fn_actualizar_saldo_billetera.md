CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_billetera()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- 1. Manejo de INCOME, OPENING y ADJUSTMENT positivos
    IF (NEW.tipo IN ('income', 'opening')) OR (NEW.tipo = 'adjustment' AND NEW.valor_ingreso > 0) THEN
        UPDATE p_billeteras 
        SET saldo_actual = saldo_actual + NEW.valor_ingreso 
        WHERE billetera_id = NEW.billetera_origen_id;

    -- 2. Manejo de EXPENSE, PAGO_TARJETA y ADJUSTMENT negativos
    ELSIF (NEW.tipo IN ('expense', 'pago_tarjeta')) OR (NEW.tipo = 'adjustment' AND NEW.valor_egreso > 0) THEN
        UPDATE p_billeteras 
        SET saldo_actual = saldo_actual - NEW.valor_egreso 
        WHERE billetera_id = NEW.billetera_origen_id;

    -- 3. Manejo de TRANSFER (Resta en origen, Suma en destino)
    ELSIF (NEW.tipo = 'transfer') THEN
        -- Restar del origen
        UPDATE p_billeteras 
        SET saldo_actual = saldo_actual - NEW.valor_egreso 
        WHERE billetera_id = NEW.billetera_origen_id;
        
        -- Sumar al destino (usamos valor_egreso porque es el monto movido)
        UPDATE p_billeteras 
        SET saldo_actual = saldo_actual + NEW.valor_egreso 
        WHERE billetera_id = NEW.billetera_destino_id;
    END IF;

    RETURN NEW;
END;
$function$;
