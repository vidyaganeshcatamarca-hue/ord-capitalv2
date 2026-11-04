-- =============================================================================
-- 74 — Recurrentes: sin tope de 3 días y tarjeta sin día elegido
--
-- Pedido del dueño (tanda 8):
--   * S5: "en la semana hasta 7, en el mes hasta 31. No hay restricción".
--   * S8: con tarjeta no se elige día (manda el cierre) y por eso no puede
--     haber error de «elegí un día».
--
-- Qué cambia:
--   1. p_gastos_recurrentes.dia_del_mes deja de ser NOT NULL (una fila de
--      tarjeta puede no tener día).
--   2. p_gastos_recurrentes_forma_check: semanal 1..7, mensual 1..31 y la
--      rama nueva "mensual con tarjeta y sin días".
--   3. fn_crear_gasto_recurrente y fn_editar_gasto_recurrente: mismos rangos y
--      aceptan días NULL cuando hay tarjeta.
--
-- NO se toca fn_generar_recurrentes_hoy: la rama tarjeta ya calcula el día con
-- el cierre de la tarjeta (cierre - 3) y no lee dias_mes. La rama billetera usa
-- COALESCE(dias_mes, ARRAY[dia_del_mes]) y con NULL no genera nada.
-- NO se toca fn_reporte_calendario_financiero por el mismo motivo.
--
-- Idempotente y en UNA transacción.
-- =============================================================================

BEGIN;

ALTER TABLE public.p_gastos_recurrentes
    ALTER COLUMN dia_del_mes DROP NOT NULL;

ALTER TABLE public.p_gastos_recurrentes
    DROP CONSTRAINT IF EXISTS p_gastos_recurrentes_forma_check;
ALTER TABLE public.p_gastos_recurrentes
    ADD CONSTRAINT p_gastos_recurrentes_forma_check CHECK (
           (modo = 'semanal'
            AND dias_semana IS NOT NULL
            AND cardinality(dias_semana) BETWEEN 1 AND 7
            AND dias_mes IS NULL AND fechas_anio IS NULL AND fecha_unica IS NULL)
        OR (modo = 'mensual'
            AND dias_mes IS NULL
            AND dia_del_mes BETWEEN 1 AND 31
            AND dias_semana IS NULL AND fechas_anio IS NULL AND fecha_unica IS NULL)
        OR (modo = 'mensual'
            AND dias_mes IS NOT NULL
            AND cardinality(dias_mes) BETWEEN 1 AND 31
            AND dias_semana IS NULL AND fechas_anio IS NULL AND fecha_unica IS NULL)
        -- tarjeta: el día lo manda el cierre, no el usuario
        OR (modo = 'mensual'
            AND tarjeta_id IS NOT NULL
            AND dias_mes IS NULL AND dia_del_mes IS NULL
            AND dias_semana IS NULL AND fechas_anio IS NULL AND fecha_unica IS NULL)
        OR (modo = 'anual'
            AND fechas_anio IS NOT NULL
            AND cardinality(fechas_anio) >= 1
            AND dias_semana IS NULL AND dias_mes IS NULL AND fecha_unica IS NULL)
        OR (modo = 'unica'
            AND fecha_unica IS NOT NULL
            AND dias_semana IS NULL AND dias_mes IS NULL AND fechas_anio IS NULL)
    );

-- ---------- fn_crear_gasto_recurrente ----------
CREATE OR REPLACE FUNCTION public.fn_crear_gasto_recurrente(p_estructura_egreso_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false)
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
        tarjeta_id, es_usd)
    VALUES (
        v_user_id, p_estructura_egreso_id, p_nombre_custom, p_monto_base,
        v_dia_del_mes, v_frecuencia, p_tipo_variabilidad, p_billetera_defecto_id,
        p_modo, v_dias_semana, v_dias_mes, v_fechas_anio, v_fecha_unica, p_fecha_fin,
        p_tarjeta_id, COALESCE(p_es_usd, false))
    RETURNING recurrente_id INTO v_recurrente_id;

    RETURN v_recurrente_id;
END;
$function$;

-- ---------- fn_editar_gasto_recurrente ----------
CREATE OR REPLACE FUNCTION public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_motivo_pausa text DEFAULT NULL::text, p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     bigint;
    v_dias_mes    integer[];
    v_dias_semana integer[];
    v_fechas_anio integer[];
    v_fecha_unica date;
    v_dia_del_mes integer;
    v_frecuencia  text;
    v_motivo      text;
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

    IF p_activo IS FALSE THEN
        v_motivo := COALESCE(p_motivo_pausa, 'pausado_por_usuario');
    ELSE
        v_motivo := NULL;
    END IF;

    UPDATE public.p_gastos_recurrentes SET
        nombre_custom         = p_nombre_custom,
        monto_base            = p_monto_base,
        dia_del_mes           = v_dia_del_mes,
        frecuencia            = v_frecuencia,
        tipo_variabilidad     = p_tipo_variabilidad,
        billetera_defecto_id  = p_billetera_defecto_id,
        activo                = p_activo,
        modo                  = p_modo,
        dias_semana           = v_dias_semana,
        dias_mes              = v_dias_mes,
        fechas_anio           = v_fechas_anio,
        fecha_unica           = v_fecha_unica,
        fecha_fin             = p_fecha_fin,
        tarjeta_id            = p_tarjeta_id,
        es_usd                = COALESCE(p_es_usd, false),
        motivo_pausa          = v_motivo,
        pausado_at            = CASE WHEN p_activo IS FALSE THEN now() ELSE NULL END
     WHERE recurrente_id = p_recurrente_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;
END;
$function$;

COMMIT;
