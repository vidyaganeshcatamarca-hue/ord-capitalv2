CREATE OR REPLACE FUNCTION public.fn_crear_gasto_recurrente(p_estructura_egreso_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false, p_naturaleza text DEFAULT 'egreso'::text, p_estructura_ingreso_id bigint DEFAULT NULL::bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_fecha_base date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id       bigint;
    v_recurrente_id bigint;
    v_dias_mes      integer[];
    v_dias_semana   integer[];
    v_fechas_anio   integer[];
    v_dia_del_mes   integer;
    v_frecuencia    text;
    v_fecha_unica   date;
    v_naturaleza    text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto_base IS NULL OR p_monto_base <= 0 THEN
        RAISE EXCEPTION '{"key": "error_recurrent_monto_invalid", "params": {}}';
    END IF;

    IF p_tipo_variabilidad IS NULL
       OR p_tipo_variabilidad NOT IN ('fijo', 'promedio_historico') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_variability_invalid", "params": {}}';
    END IF;

    IF p_modo IS NULL OR p_modo NOT IN ('semanal', 'mensual', 'anual', 'unica') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_modo_invalid", "params": {}}';
    END IF;

    v_naturaleza := COALESCE(NULLIF(p_naturaleza, ''), 'egreso');
    -- ---------- naturaleza: egreso o ingreso ----------
    -- Un recurrente tiene una sola naturaleza. El ingreso no paga con tarjeta ni
    -- lleva categoria de egreso: cobra en una billetera destino. El egreso no
    -- lleva fuente de ingreso ni billetera destino.
    IF v_naturaleza NOT IN ('egreso', 'ingreso') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_naturaleza_invalid", "params": {}}';
    END IF;

    IF v_naturaleza = 'ingreso' THEN
        IF p_tarjeta_id IS NOT NULL OR p_estructura_egreso_id IS NOT NULL
           OR p_billetera_defecto_id IS NOT NULL OR COALESCE(p_es_usd, false) THEN
            RAISE EXCEPTION '{"key": "error_recurrent_ingreso_origen_invalido", "params": {}}';
        END IF;
        IF p_billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_billetera_destino_required", "params": {}}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_billeteras w
                        WHERE w.billetera_id = p_billetera_destino_id
                          AND w.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
        IF p_estructura_ingreso_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.p_ingresos i
                            WHERE i.producto_id = p_estructura_ingreso_id
                              AND i.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_income_source_not_found", "params": {}}';
        END IF;
    ELSIF p_estructura_ingreso_id IS NOT NULL OR p_billetera_destino_id IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_recurrent_egreso_origen_invalido", "params": {}}';
    END IF;

    -- ---------- origen: billetera o tarjeta ----------
    IF p_tarjeta_id IS NOT NULL THEN
        IF p_billetera_defecto_id IS NOT NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_origen_ambiguo", "params": {}}';
        END IF;
        IF p_modo <> 'mensual' THEN
            RAISE EXCEPTION '{"key": "error_recurrent_modo_tarjeta_invalid", "params": {}}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_tarjetas_credito t
                        WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
        END IF;
    ELSIF p_es_usd IS TRUE THEN
        RAISE EXCEPTION '{"key": "error_recurrent_usd_sin_tarjeta", "params": {}}';
    END IF;

    IF p_modo = 'semanal' THEN
        IF p_dias_semana IS NULL OR cardinality(p_dias_semana) NOT BETWEEN 1 AND 7 THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "semanal"}}';
        END IF;
        IF NOT (p_dias_semana <@ ARRAY[1,2,3,4,5,6,7]) THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_invalid", "params": {"campo": "dias_semana"}}';
        END IF;
        v_dias_semana := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(p_dias_semana) d);
        v_dias_mes := NULL; v_fechas_anio := NULL; v_fecha_unica := NULL;
        v_dia_del_mes := 1;
        v_frecuencia := 'mensual';

    ELSIF p_modo = 'mensual' THEN
        -- Con tarjeta NO se elige día: el día lo manda el cierre de la
        -- tarjeta y la ocurrencia se propone 3 días antes. Si el usuario no
        -- eligió días, se guardan las dos columnas en NULL.
        IF p_tarjeta_id IS NOT NULL AND p_dias_mes IS NULL AND p_dia_del_mes IS NULL THEN
            v_dias_mes := NULL;
            v_dia_del_mes := NULL;
        ELSE
            v_dias_mes := COALESCE(p_dias_mes, ARRAY[p_dia_del_mes]);
            IF v_dias_mes IS NULL
               OR cardinality(v_dias_mes) NOT BETWEEN 1 AND 31
               OR EXISTS (SELECT 1 FROM unnest(v_dias_mes) x WHERE x IS NULL) THEN
                RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "mensual"}}';
            END IF;
            IF NOT (v_dias_mes <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]) THEN
                RAISE EXCEPTION '{"key": "error_recurrent_dates_invalid", "params": {"campo": "dias_mes"}}';
            END IF;
            v_dias_mes := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(v_dias_mes) d);
            v_dia_del_mes := v_dias_mes[1];
        END IF;
        v_dias_semana := NULL; v_fechas_anio := NULL; v_fecha_unica := NULL;
        v_frecuencia := COALESCE(NULLIF(p_frecuencia, 'anual'), 'mensual');

    ELSIF p_modo = 'anual' THEN
        IF p_fechas_anio IS NULL OR cardinality(p_fechas_anio) < 1 THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "anual"}}';
        END IF;
        IF NOT (p_fechas_anio <@ (SELECT array_agg(m * 100 + d)::integer[]
                                    FROM generate_series(1,12) m,
                                         LATERAL generate_series(1, EXTRACT(DAY FROM
                                           (make_date(2024, m, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int) d)) THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_invalid", "params": {"campo": "fechas_anio"}}';
        END IF;
        v_fechas_anio := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(p_fechas_anio) d);
        v_dias_semana := NULL; v_dias_mes := NULL; v_fecha_unica := NULL;
        v_dia_del_mes := (v_fechas_anio[1] % 100)::int;
        v_frecuencia := 'anual';

    ELSE  -- unica
        IF p_fecha_unica IS NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "unica"}}';
        END IF;
        v_fecha_unica := p_fecha_unica;
        v_dias_semana := NULL; v_dias_mes := NULL; v_fechas_anio := NULL;
        v_dia_del_mes := EXTRACT(DAY FROM p_fecha_unica)::int;
        v_frecuencia := 'anual';
    END IF;

    IF p_fecha_fin IS NOT NULL
       AND v_fecha_unica IS NOT NULL
       AND p_fecha_fin < v_fecha_unica THEN
        RAISE EXCEPTION '{"key": "error_recurrent_fecha_fin_invalid", "params": {}}';
    END IF;

    INSERT INTO public.p_gastos_recurrentes (
        user_id, estructura_egreso_id, nombre_custom, monto_base,
        dia_del_mes, frecuencia, tipo_variabilidad, billetera_defecto_id,
        modo, dias_semana, dias_mes, fechas_anio, fecha_unica, fecha_fin,
        tarjeta_id, es_usd, naturaleza, estructura_ingreso_id, billetera_destino_id)
    VALUES (
        v_user_id, p_estructura_egreso_id, p_nombre_custom, p_monto_base,
        v_dia_del_mes, v_frecuencia, p_tipo_variabilidad, p_billetera_defecto_id,
        p_modo, v_dias_semana, v_dias_mes, v_fechas_anio, v_fecha_unica, p_fecha_fin,
        p_tarjeta_id, COALESCE(p_es_usd, false),
        v_naturaleza, p_estructura_ingreso_id, p_billetera_destino_id)
    RETURNING recurrente_id INTO v_recurrente_id;

    -- El «desde» de una recurrente nueva es su alta: la primera ocurrencia del
    -- patrón desde hoy.
    UPDATE public.p_gastos_recurrentes r
       SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
               r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
               r.fecha_unica, r.tarjeta_id, COALESCE(p_fecha_base, CURRENT_DATE))
     WHERE r.recurrente_id = v_recurrente_id;

    RETURN v_recurrente_id;
END;
$function$
