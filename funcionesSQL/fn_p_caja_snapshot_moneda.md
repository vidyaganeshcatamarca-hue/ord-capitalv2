CREATE OR REPLACE FUNCTION public.fn_p_caja_snapshot_moneda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_monto numeric;
    v_moneda_efectiva text;
    v_snap record;
    v_recalc boolean;
BEGIN
    IF NEW.tipo = 'transfer' THEN
        RETURN NEW;
    END IF;

    v_monto := COALESCE(NULLIF(NEW.valor_egreso, 0), NULLIF(NEW.valor_ingreso, 0), 0);
    IF v_monto IS NULL OR v_monto = 0 THEN
        RETURN NEW;
    END IF;

    v_moneda_efectiva := CASE WHEN NEW.es_usd THEN 'USD'
        ELSE COALESCE(
            (SELECT b.moneda FROM public.p_billeteras b
              WHERE b.billetera_id = COALESCE(NEW.billetera_origen_id, NEW.billetera_destino_id)),
            NEW.moneda)
    END;
    IF v_moneda_efectiva IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Editar monto, moneda o billetera re-congela con la tasa de HOY (regla del dueno).
        -- Un update que no toca nada monetario (conciliar, observaciones) no toca el snapshot.
        v_recalc := (NEW.valor_local IS NULL)
                 OR NEW.valor_egreso IS DISTINCT FROM OLD.valor_egreso
                 OR NEW.valor_ingreso IS DISTINCT FROM OLD.valor_ingreso
                 OR NEW.es_usd IS DISTINCT FROM OLD.es_usd
                 OR NEW.billetera_origen_id IS DISTINCT FROM OLD.billetera_origen_id
                 OR NEW.billetera_destino_id IS DISTINCT FROM OLD.billetera_destino_id;
        IF NOT v_recalc THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT * INTO v_snap FROM public.fn_valor_a_moneda_local(v_monto, v_moneda_efectiva, NEW.user_id);
    IF v_snap.valor IS NOT NULL THEN
        NEW.valor_local := v_snap.valor;
        NEW.moneda_local := v_snap.moneda;
        NEW.tasa_snapshot := v_snap.tasa;
    END IF;
    RETURN NEW;
END;
$function$

