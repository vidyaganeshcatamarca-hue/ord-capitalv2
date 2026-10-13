-- Correccion del snapshot: la moneda de un movimiento es la de su billetera, no el
-- default 'ARS' que dejo el modelo legacy (p_caja.moneda no la setean los RPCs de carga).
-- Orden de resolucion: es_usd (legacy explicito) gana; si no, moneda de la billetera
-- destino u origen; si no hay billetera, la registrada. Los transfer se excluyen (no
-- entran en reportes de analisis y el cruce ya ocurre a nivel saldo de billetera).
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
$function$;

-- Backfill re-hecho: resuelve la moneda efectiva (billetera/es_usd) y re-congela todo,
-- porque el backfill anterior congelo con la moneda mal etiquetada (default ARS).
WITH base AS (
    SELECT c.p_caja_id,
           COALESCE(NULLIF(c.valor_egreso, 0), NULLIF(c.valor_ingreso, 0), 0) AS monto,
           CASE WHEN c.es_usd THEN 'USD'
                ELSE COALESCE(b.moneda, c.moneda)
           END AS moneda_efectiva,
           COALESCE(r.moneda_default, 'ARS') AS moneda_local
    FROM public.p_caja c
    LEFT JOIN public.p_config_region r ON r.user_id = c.user_id
    LEFT JOIN public.p_billeteras b
           ON b.billetera_id = COALESCE(c.billetera_origen_id, c.billetera_destino_id)
    WHERE c.tipo <> 'transfer'
      AND COALESCE(NULLIF(c.valor_egreso, 0), NULLIF(c.valor_ingreso, 0), 0) > 0
)
UPDATE public.p_caja c
SET valor_local    = ROUND(b.monto * (l.valor_por_usd / o.valor_por_usd), 2),
    tasa_snapshot  = l.valor_por_usd / o.valor_por_usd,
    moneda_local   = b.moneda_local
FROM base b
JOIN public.p_divisas o ON o.nombre = b.moneda_efectiva
JOIN public.p_divisas l ON l.nombre = b.moneda_local
WHERE c.p_caja_id = b.p_caja_id;