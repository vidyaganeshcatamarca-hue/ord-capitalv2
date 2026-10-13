-- Opcion B (aprobada): freeze del impacto en moneda local al momento de la operacion.
-- Fuente de verdad = el momento en que se ejecuta/movimiento se edita.
-- 1) columnas, 2) helper unico de conversion, 3) trigger que congela en todo INSERT,
--    y en todo UPDATE que cambie monto o moneda (editar hoy recalcula con la tasa de hoy;
--    un update que no toca monto no distorsiona el historico). Cotizacion faltante:
--    snapshot NULL, nunca inventar.
ALTER TABLE public.p_caja
  ADD COLUMN IF NOT EXISTS valor_local numeric,
  ADD COLUMN IF NOT EXISTS moneda_local text,
  ADD COLUMN IF NOT EXISTS tasa_snapshot numeric;

CREATE OR REPLACE FUNCTION public.fn_valor_a_moneda_local(p_monto numeric, p_moneda text, p_user_id bigint)
 RETURNS TABLE(valor numeric, tasa numeric, moneda text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_moneda_local text;
    v_rate_origen numeric;
    v_rate_local numeric;
BEGIN
    -- Moneda local del pais confirmado; sin configuracion regional, ARS (comportamiento historico).
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = p_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    IF p_monto IS NULL OR p_monto = 0 OR p_moneda IS NULL THEN
        RETURN QUERY SELECT NULL::numeric AS valor, NULL::numeric AS tasa, v_moneda_local::text AS moneda;
        RETURN;
    END IF;

    IF p_moneda = v_moneda_local THEN
        RETURN QUERY SELECT p_monto, 1.0, v_moneda_local;
        RETURN;
    END IF;

    SELECT d.valor_por_usd INTO v_rate_origen FROM public.p_divisas d WHERE d.nombre = p_moneda;
    SELECT d.valor_por_usd INTO v_rate_local FROM public.p_divisas d WHERE d.nombre = v_moneda_local;
    IF v_rate_origen IS NULL OR v_rate_local IS NULL OR v_rate_origen = 0 OR v_rate_local = 0 THEN
        -- Cotizacion no disponible: no se congela nada, nunca inventar.
        RETURN QUERY SELECT NULL::numeric AS valor, NULL::numeric AS tasa, v_moneda_local::text AS moneda;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT ROUND(p_monto * (v_rate_local / v_rate_origen), 2),
           (v_rate_local / v_rate_origen),
           v_moneda_local;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_p_caja_snapshot_moneda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_monto numeric;
    v_snap record;
    v_recalc boolean;
BEGIN
    v_monto := COALESCE(NULLIF(NEW.valor_egreso, 0), NULLIF(NEW.valor_ingreso, 0), 0);
    IF v_monto IS NULL OR v_monto = 0 OR NEW.moneda IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Editar el monto o la moneda re-congela con la tasa de HOY (regla del dueno).
        -- Un update que no toca el monto (conciliar, observaciones) no toca el snapshot.
        v_recalc := (NEW.valor_local IS NULL)
                 OR NEW.valor_egreso IS DISTINCT FROM OLD.valor_egreso
                 OR NEW.valor_ingreso IS DISTINCT FROM OLD.valor_ingreso
                 OR NEW.moneda IS DISTINCT FROM OLD.moneda;
        IF NOT v_recalc THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT * INTO v_snap FROM public.fn_valor_a_moneda_local(v_monto, NEW.moneda, NEW.user_id);
    IF v_snap.valor IS NOT NULL THEN
        NEW.valor_local := v_snap.valor;
        NEW.moneda_local := v_snap.moneda;
        NEW.tasa_snapshot := v_snap.tasa;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_p_caja_snapshot_moneda ON public.p_caja;
CREATE TRIGGER trg_p_caja_snapshot_moneda
    BEFORE INSERT OR UPDATE ON public.p_caja
    FOR EACH ROW EXECUTE FUNCTION public.fn_p_caja_snapshot_moneda();