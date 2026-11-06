CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_billetera_integral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_moneda_origen text; 
    v_moneda_destino text;
BEGIN
    -- Validar transferencia (solo en INSERT y UPDATE)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF (NEW.tipo = 'transfer') THEN
            SELECT moneda INTO v_moneda_origen FROM p_billeteras WHERE billetera_id = NEW.billetera_origen_id;
            SELECT moneda INTO v_moneda_destino FROM p_billeteras WHERE billetera_id = NEW.billetera_destino_id;
            
            IF v_moneda_origen != v_moneda_destino THEN
                RAISE EXCEPTION '{"key": "error_transfer_different_currencies", "params": {"currency_from": "%", "currency_to": "%"}}', v_moneda_origen, v_moneda_destino;
            END IF;
        END IF;
    END IF;

    -- Manejo de Reversiones en DELETE y UPDATE (OLD)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF (OLD.tipo IN ('income', 'opening')) OR (OLD.tipo = 'adjustment' AND OLD.valor_ingreso > 0) THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual - OLD.valor_ingreso WHERE billetera_id = OLD.billetera_origen_id;
        ELSIF (OLD.tipo IN ('expense', 'pago_tarjeta')) OR (OLD.tipo = 'adjustment' AND OLD.valor_egreso > 0) THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual + OLD.valor_egreso WHERE billetera_id = OLD.billetera_origen_id;
        ELSIF (OLD.tipo = 'transfer') THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual + OLD.valor_egreso WHERE billetera_id = OLD.billetera_origen_id;
            UPDATE p_billeteras SET saldo_actual = saldo_actual - OLD.valor_egreso WHERE billetera_id = OLD.billetera_destino_id;
        END IF;
    END IF;

    -- Manejo de Aplicación en INSERT y UPDATE (NEW)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF (NEW.tipo IN ('income', 'opening')) OR (NEW.tipo = 'adjustment' AND NEW.valor_ingreso > 0) THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual + NEW.valor_ingreso WHERE billetera_id = NEW.billetera_origen_id;
        ELSIF (NEW.tipo IN ('expense', 'pago_tarjeta')) OR (NEW.tipo = 'adjustment' AND NEW.valor_egreso > 0) THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual - NEW.valor_egreso WHERE billetera_id = NEW.billetera_origen_id;
        ELSIF (NEW.tipo = 'transfer') THEN
            UPDATE p_billeteras SET saldo_actual = saldo_actual - NEW.valor_egreso WHERE billetera_id = NEW.billetera_origen_id;
            UPDATE p_billeteras SET saldo_actual = saldo_actual + NEW.valor_egreso WHERE billetera_id = NEW.billetera_destino_id;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;