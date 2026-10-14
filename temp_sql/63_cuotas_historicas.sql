-- Carga de cuotas historicas por tarjeta (spec docs/superpowers/specs/2026-10-14-carga-cuotas-historicas-design.md)
-- DDL aditivo + 2 RPCs nuevas. Despliegue via temp_sql/63b_deploy.mjs.

-- ---------- §3 DDL ----------
ALTER TABLE public.p_cuotas_detalle
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS estructura_egreso_id bigint,
  ADD COLUMN IF NOT EXISTS carga_id bigint;

CREATE SEQUENCE IF NOT EXISTS public.p_cuotas_carga_seq START 1;

-- ---------- §5.1 registrar ----------
CREATE OR REPLACE FUNCTION public.fn_registrar_cuotas_historicas(
    p_tarjeta_id bigint,
    p_detalle text,
    p_cantidad integer,
    p_monto_cuota numeric,
    p_mes_inicio date,
    p_moneda text,
    p_estructura_egreso_id bigint DEFAULT NULL
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Carga de cuotas pendientes de ciclos anteriores (pre-instalacion).
-- Genera N cuotas huerfanas (sin p_caja_id) a partir del mes elegido, al
-- dia_vencimiento de la tarjeta, para que resumenes/vencimientos/termometro
-- las computen como si hubieran nacido de un gasto. El grupo comparte un
-- carga_id (secuencia p_cuotas_carga_seq) para deshacerse mientras nada
-- este pago. Sin p_caja por diseño: el donut incluye gastos de tarjeta y un
-- movimiento historico inflaria los reportes del ciclo.
DECLARE
    v_user_id bigint;
    v_dia_vencimiento int;
    v_tarjeta_activa boolean;
    v_mono_local text;
    v_mes date;
    v_i int;
    v_fecha_cuota date;
    v_mes_periodo date;
    v_carga_id bigint;
    v_dia_max int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT t.dia_vencimiento, t.activa INTO v_dia_vencimiento, v_tarjeta_activa
      FROM public.p_tarjetas_credito t
      WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id;
    IF NOT FOUND OR NOT v_tarjeta_activa OR v_dia_vencimiento IS NULL THEN
        RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
    END IF;

    IF p_detalle IS NULL OR btrim(p_detalle) = '' THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "detalle"}}';
    END IF;
    IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 120 THEN
        RAISE EXCEPTION '{"key": "error_invalid_cuotas", "params": {"max": "120"}}';
    END IF;
    IF p_monto_cuota IS NULL OR p_monto_cuota <= 0 THEN
        RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
    END IF;
    IF p_mes_inicio IS NULL OR date_trunc('month', p_mes_inicio)::date < date_trunc('month', CURRENT_DATE)::date
       OR date_trunc('month', p_mes_inicio)::date > (date_trunc('month', CURRENT_DATE) + INTERVAL '24 months')::date THEN
        RAISE EXCEPTION '{"key": "error_invalid_first_due_month", "params": {}}';
    END IF;
    v_mes := date_trunc('month', p_mes_inicio)::date;

    SELECT COALESCE(cr.moneda_default, 'ARS') INTO v_mono_local
      FROM public.p_config_region cr WHERE cr.user_id = v_user_id;
    v_mono_local := COALESCE(v_mono_local, 'ARS');
    IF p_moneda NOT IN (v_mono_local, 'USD') THEN
        RAISE EXCEPTION '{"key": "error_currency_not_supported", "params": {}}';
    END IF;

    v_carga_id := nextval('public.p_cuotas_carga_seq');

    FOR v_i IN 0..(p_cantidad - 1) LOOP
        -- Clamp del dia de vencimiento al ultimo dia del mes destino (feb/31)
        v_dia_max := EXTRACT(DAY FROM ((v_mes + ((v_i + 1) || ' months')::interval - INTERVAL '1 day')::date))::int;
        v_fecha_cuota := (v_mes + (v_i || ' months')::interval
                          + ((LEAST(v_dia_vencimiento, v_dia_max) - 1) * INTERVAL '1 day'))::date;

        SELECT date_trunc('month', f.fecha_inicio)::date INTO v_mes_periodo
          FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_cuota) f;

        INSERT INTO public.p_cuotas_detalle (
            user_id, tarjeta_id, numero_cuota, monto_cuota, moneda,
            fecha_estimada_pago, pagado, p_caja_id,
            descripcion, estructura_egreso_id, carga_id
        ) VALUES (
            v_user_id, p_tarjeta_id, v_i + 1, p_monto_cuota, p_moneda,
            v_fecha_cuota, false, NULL,
            btrim(p_detalle), p_estructura_egreso_id, v_carga_id
        );

        INSERT INTO public.p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
        VALUES (p_tarjeta_id, v_user_id, p_monto_cuota, v_mes_periodo)
        ON CONFLICT (tarjeta_id, mes_periodo, user_id)
        DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END LOOP;

    RETURN v_carga_id;
END;
$function$;

-- ---------- §5.2 eliminar ----------
CREATE OR REPLACE FUNCTION public.fn_eliminar_carga_cuotas_historicas(p_carga_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Deshace una carga completa. Solo si NINGUNA cuota del grupo esta pagada.
-- Revierte los compromisos mensuales sumados al cargar.
DECLARE
    v_user_id bigint;
    v_count int;
    v_pagadas int;
    r RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT count(*), count(*) FILTER (WHERE pagado) INTO v_count, v_pagadas
      FROM public.p_cuotas_detalle
      WHERE carga_id = p_carga_id AND user_id = v_user_id;

    IF v_count = 0 THEN
        RAISE EXCEPTION '{"key": "error_carga_not_found", "params": {}}';
    END IF;
    IF v_pagadas > 0 THEN
        RAISE EXCEPTION '{"key": "error_carga_tiene_pagos", "params": {}}';
    END IF;

    -- Revertir compromisos: fecha -> mes_periodo -> resta por mes
    FOR r IN
        WITH borradas AS (
            SELECT cd.tarjeta_id, cd.fecha_estimada_pago, cd.monto_cuota
              FROM public.p_cuotas_detalle cd
              WHERE cd.carga_id = p_carga_id AND cd.user_id = v_user_id
        ),
        por_fecha AS (
            SELECT b.tarjeta_id,
                   (SELECT date_trunc('month', f.fecha_inicio)::date
                      FROM public.fn_obtener_fechas_ciclo_presupuesto(b.fecha_estimada_pago) f) AS mes_periodo,
                   SUM(b.monto_cuota) AS monto
              FROM borradas b
              GROUP BY b.tarjeta_id, b.fecha_estimada_pago
        )
        SELECT tarjeta_id, mes_periodo, SUM(monto) AS monto
          FROM por_fecha GROUP BY tarjeta_id, mes_periodo
    LOOP
        UPDATE public.p_compromisos_tarjeta
           SET monto_cuota = monto_cuota - r.monto
         WHERE tarjeta_id = r.tarjeta_id AND user_id = v_user_id AND mes_periodo = r.mes_periodo;
        DELETE FROM public.p_compromisos_tarjeta
         WHERE tarjeta_id = r.tarjeta_id AND user_id = v_user_id AND mes_periodo = r.mes_periodo
           AND monto_cuota <= 0;
    END LOOP;

    DELETE FROM public.p_cuotas_detalle WHERE carga_id = p_carga_id AND user_id = v_user_id;
    RETURN v_count;
END;
$function$;