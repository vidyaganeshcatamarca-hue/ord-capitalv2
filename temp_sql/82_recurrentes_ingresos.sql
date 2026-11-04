-- =============================================================================
-- 82 — Recurrentes de ingreso
--
-- Extiende el modulo (no crea una tabla nueva): la misma tabla, el mismo motor
-- de calendario, la misma cuarentena y la misma pantalla aprenden a tratar un
-- ingreso. Las decisiones estan en odd/tasks/recurrentes-ingresos.md (S1-S6).
--
-- Naturaleza `ingreso`:
--   · no paga con tarjeta ni lleva categoria de egreso;
--   · cobra en una billetera destino (obligatoria);
--   · la fuente de ingreso es opcional, igual que en la carga manual;
--   · la ocurrencia nace en cuarentena con tipo 'income' y, al aprobarla,
--     fn_aprobar_cuarentena_v2 la asienta como ingreso en esa billetera
--     (ese camino ya existia y no se toca).
--
-- Parametros nuevos AL FINAL y con default: el bundle que esta en produccion
-- sigue llamando con los argumentos viejos y no se rompe durante el deploy.
-- =============================================================================

BEGIN;

ALTER TABLE public.p_gastos_recurrentes
    ADD COLUMN IF NOT EXISTS naturaleza            text NOT NULL DEFAULT 'egreso',
    ADD COLUMN IF NOT EXISTS estructura_ingreso_id bigint,
    ADD COLUMN IF NOT EXISTS billetera_destino_id  bigint;

DO $mig$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'p_gastos_recurrentes_estructura_ingreso_fk') THEN
        ALTER TABLE public.p_gastos_recurrentes
            ADD CONSTRAINT p_gastos_recurrentes_estructura_ingreso_fk
            FOREIGN KEY (estructura_ingreso_id) REFERENCES public.p_ingresos(producto_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'p_gastos_recurrentes_billetera_destino_fk') THEN
        ALTER TABLE public.p_gastos_recurrentes
            ADD CONSTRAINT p_gastos_recurrentes_billetera_destino_fk
            FOREIGN KEY (billetera_destino_id) REFERENCES public.p_billeteras(billetera_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'p_gastos_recurrentes_naturaleza_chk') THEN
        ALTER TABLE public.p_gastos_recurrentes
            ADD CONSTRAINT p_gastos_recurrentes_naturaleza_chk
            CHECK (naturaleza IN ('egreso', 'ingreso'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'p_gastos_recurrentes_naturaleza_origen_chk') THEN
        ALTER TABLE public.p_gastos_recurrentes
            ADD CONSTRAINT p_gastos_recurrentes_naturaleza_origen_chk CHECK (
                (naturaleza = 'ingreso'
                 AND estructura_egreso_id IS NULL
                 AND billetera_defecto_id IS NULL
                 AND tarjeta_id IS NULL
                 AND COALESCE(es_usd, false) = false
                 AND billetera_destino_id IS NOT NULL)
                OR
                (naturaleza = 'egreso'
                 AND estructura_ingreso_id IS NULL
                 AND billetera_destino_id IS NULL)
            );
    END IF;
END
$mig$;

DROP FUNCTION IF EXISTS public.fn_listar_gastos_recurrentes();

CREATE OR REPLACE FUNCTION public.fn_crear_gasto_recurrente(p_estructura_egreso_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false, p_naturaleza text DEFAULT 'egreso'::text, p_estructura_ingreso_id bigint DEFAULT NULL::bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint)
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
               r.fecha_unica, r.tarjeta_id, CURRENT_DATE)
     WHERE r.recurrente_id = v_recurrente_id;

    RETURN v_recurrente_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_motivo_pausa text DEFAULT NULL::text, p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_naturaleza text DEFAULT NULL::text, p_estructura_ingreso_id bigint DEFAULT NULL::bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint)
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
    v_motivo            text;
    v_naturaleza        text;
    v_naturaleza_actual text;
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

    -- La naturaleza no se adivina: si el llamador no la manda (bundle viejo) se
    -- conserva la de la fila. Nunca se degrada un ingreso a egreso.
    SELECT COALESCE(r.naturaleza, 'egreso') INTO v_naturaleza_actual
      FROM public.p_gastos_recurrentes r
     WHERE r.recurrente_id = p_recurrente_id AND r.user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;
    v_naturaleza := COALESCE(NULLIF(p_naturaleza, ''), v_naturaleza_actual);

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
        -- La categoría (estructura de egreso) faltaba en el UPDATE: cambiarla en
        -- el modal se guardaba en el payload y se descartaba acá. COALESCE para
        -- que un cliente viejo, que no manda el parámetro, no la borre.
        estructura_egreso_id  = COALESCE(p_estructura_egreso_id, estructura_egreso_id),
        naturaleza            = v_naturaleza,
        estructura_ingreso_id = p_estructura_ingreso_id,
        billetera_destino_id  = p_billetera_destino_id,
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

    -- Al editar, el puntero se RECALCULA DESDE HOY. Sin esto quedaría apuntando
    -- a una fecha que ya no existe en el patrón nuevo (la ocurrencia nunca se
    -- generaría) o al pasado (se generaría el patrón viejo de nuevo).
    UPDATE public.p_gastos_recurrentes r
       SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
               r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
               r.fecha_unica, r.tarjeta_id, CURRENT_DATE)
     WHERE r.recurrente_id = p_recurrente_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_listar_gastos_recurrentes()
 RETURNS TABLE(recurrente_id bigint, nombre text, nombre_categoria text, icono text, monto_base numeric, dia_del_mes integer, frecuencia text, tipo_variabilidad text, billetera_nombre text, activo boolean, billetera_defecto_id bigint, estructura_egreso_id bigint, modo text, dias_semana smallint[], dias_mes smallint[], fechas_anio smallint[], motivo_pausa text, pausado_at timestamp with time zone, ocurrencias_pendientes integer, fecha_unica date, fecha_fin date, tarjeta_id bigint, tarjeta_nombre text, es_usd boolean, moneda text, naturaleza text, estructura_ingreso_id bigint, ingreso_nombre text, ingreso_icono text, billetera_destino_id bigint, billetera_destino_nombre text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        r.recurrente_id,
        COALESCE(r.nombre_custom,
                 CASE WHEN COALESCE(r.naturaleza, 'egreso') = 'ingreso'
                      THEN i.nombre ELSE e.nombre_cuenta END)  AS nombre,
        CASE WHEN COALESCE(r.naturaleza, 'egreso') = 'ingreso'
             THEN i.nombre ELSE e.nombre_cuenta END             AS nombre_categoria,
        CASE WHEN COALESCE(r.naturaleza, 'egreso') = 'ingreso'
             THEN i.icono ELSE e.icono END                      AS icono,
        r.monto_base,
        r.dia_del_mes,
        r.frecuencia,
        r.tipo_variabilidad,
        COALESCE(b.nombre, wd.nombre)                AS billetera_nombre,
        COALESCE(r.activo, false),
        r.billetera_defecto_id,
        r.estructura_egreso_id,
        r.modo,
        r.dias_semana,
        r.dias_mes,
        r.fechas_anio,
        r.motivo_pausa,
        r.pausado_at,
        COALESCE(q.pendientes, 0)::integer,
        r.fecha_unica,
        r.fecha_fin,
        r.tarjeta_id,
        tj.nombre_tarjeta                            AS tarjeta_nombre,
        COALESCE(r.es_usd, false),
        -- Moneda del monto. El número solo no dice en qué moneda está: la
        -- billetera tiene la suya y la tarjeta la suya.
        --   · tarjeta en dólares (es_usd) -> USD, que es lo que se registra;
        --   · billetera                    -> su propia moneda;
        --   · tarjeta sin USD              -> la moneda de la tarjeta;
        --   · filas viejas sin origen      -> ARS, la base de la app.
        CASE
            WHEN COALESCE(r.es_usd, false)            THEN 'USD'
            WHEN COALESCE(r.naturaleza, 'egreso') = 'ingreso'
                                                      THEN COALESCE(wd.moneda, 'ARS')
            WHEN b.moneda IS NOT NULL                 THEN b.moneda
            WHEN tj.moneda_iso IS NOT NULL            THEN tj.moneda_iso
            ELSE 'ARS'
        END                                          AS moneda,
        COALESCE(r.naturaleza, 'egreso')             AS naturaleza,
        r.estructura_ingreso_id,
        i.nombre                                     AS ingreso_nombre,
        i.icono                                      AS ingreso_icono,
        r.billetera_destino_id,
        wd.nombre                                    AS billetera_destino_nombre
    FROM public.p_gastos_recurrentes r
    LEFT JOIN public.p_estructuras_egresos e ON r.estructura_egreso_id = e.estructura_id
    LEFT JOIN public.p_billeteras          b ON r.billetera_defecto_id = b.billetera_id
    LEFT JOIN public.p_tarjetas_credito  tj ON r.tarjeta_id = tj.tarjeta_id
    LEFT JOIN public.p_ingresos           i ON r.estructura_ingreso_id = i.producto_id
    LEFT JOIN public.p_billeteras        wd ON r.billetera_destino_id = wd.billetera_id
    LEFT JOIN (
        SELECT c.recurrente_id, count(*) AS pendientes
          FROM public.p_caja_cuarentena c
         WHERE c.origen = 'recurrente' AND c.estado = 'pendiente'
         GROUP BY c.recurrente_id
    ) q ON q.recurrente_id = r.recurrente_id
    WHERE r.user_id = v_user_id
    ORDER BY COALESCE(r.activo, false) DESC,
             COALESCE(r.fecha_unica, r.fecha_fin, make_date(9999, 12, 31)) ASC,
             r.creado_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generar_recurrentes_usuario(p_hoy date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id    bigint;
    v_hoy        date;
    v_fin        date;
    v_insertados int := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- El cliente manda su fecha local, pero nunca más de un día de diferencia
    -- con el reloj del servidor: el resto se ignora.
    v_hoy := LEAST(GREATEST(COALESCE(p_hoy, CURRENT_DATE), CURRENT_DATE - 1),
                   CURRENT_DATE + 1);

    -- Una sola pasada, todo el atraso junto: de proxima_ocurrencia a min(hoy, fecha_fin).
    WITH candidatas AS (
        SELECT r.recurrente_id, r.user_id, r.estructura_egreso_id,
               r.billetera_defecto_id, r.tarjeta_id, r.es_usd,
               COALESCE(r.naturaleza, 'egreso') AS naturaleza,
               r.estructura_ingreso_id, r.billetera_destino_id,
               r.tipo_variabilidad, r.monto_base, d::date AS fecha
          FROM public.p_gastos_recurrentes r
          CROSS JOIN LATERAL generate_series(
                   r.proxima_ocurrencia::timestamp,
                   LEAST(v_hoy, COALESCE(r.fecha_fin, v_hoy))::timestamp,
                   INTERVAL '1 day') AS d
         WHERE r.user_id = v_user_id
           AND r.activo IS TRUE
           AND r.proxima_ocurrencia IS NOT NULL
           AND r.proxima_ocurrencia <= LEAST(v_hoy, COALESCE(r.fecha_fin, v_hoy))
           AND (
                -- una única vez
                   (r.modo = 'unica' AND d::date = r.fecha_unica)
                -- semanal
                OR (r.modo = 'semanal'
                    AND EXTRACT(ISODOW FROM d)::int = ANY (COALESCE(r.dias_semana, '{}'::smallint[])))
                -- mensual de billetera: alguno de los días, recortado al último del mes
                OR (r.modo = 'mensual' AND r.tarjeta_id IS NULL
                    AND EXISTS (SELECT 1 FROM unnest(COALESCE(r.dias_mes, '{}'::smallint[])) AS x(valor)
                                 WHERE LEAST(x.valor::int,
                                             EXTRACT(DAY FROM (date_trunc('month', d)
                                                               + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                            ) = EXTRACT(DAY FROM d)::int))
                -- mensual de tarjeta: cierre del ciclo menos 3 días (con arrastre de mes)
                OR (r.tarjeta_id IS NOT NULL
                    AND EXISTS (SELECT 1
                                  FROM public.p_tarjetas_credito t,
                                       generate_series(0, 1) AS m(mes)
                                 WHERE t.tarjeta_id = r.tarjeta_id
                                   AND d::date =
                                       (date_trunc('month', d) + (m.mes || ' months')::interval)::date
                                       + (LEAST(t.dia_cierre,
                                                EXTRACT(DAY FROM (date_trunc('month', d)
                                                                  + (m.mes || ' months')::interval
                                                                  + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                               ) - 1) * INTERVAL '1 day'
                                       - INTERVAL '3 days'))
                -- anual: mes*100+día, con el 29/02 recortado al 28
                OR (r.modo = 'anual'
                    AND EXISTS (SELECT 1 FROM unnest(COALESCE(r.fechas_anio, '{}'::smallint[])) AS f(valor)
                                 WHERE (f.valor / 100)::int = EXTRACT(MONTH FROM d)::int
                                   AND LEAST((f.valor % 100)::int,
                                             EXTRACT(DAY FROM (date_trunc('month', d)
                                                               + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                            ) = EXTRACT(DAY FROM d)::int))
               )
    ), ins AS (
        INSERT INTO public.p_caja_cuarentena (
            user_id, origen, tipo, recurrente_id, tarjeta_id, billetera_id,
            estructura_egreso_id, cuenta_ingreso_id, billetera_destino_id,
            monto, moneda, cuotas, fecha, detalle)
        SELECT c.user_id,
               'recurrente',
               CASE WHEN c.naturaleza = 'ingreso'            THEN 'income'
                    WHEN c.tarjeta_id IS NOT NULL            THEN 'card_expense'
                    ELSE 'expense' END,
               c.recurrente_id,
               c.tarjeta_id,
               CASE WHEN c.tarjeta_id IS NOT NULL OR c.naturaleza = 'ingreso'
                    THEN NULL ELSE c.billetera_defecto_id END,
               c.estructura_egreso_id,
               c.estructura_ingreso_id,
               c.billetera_destino_id,
               CASE WHEN c.tipo_variabilidad = 'fijo'
                    THEN COALESCE(c.monto_base, 0)
                    ELSE COALESCE(prom.promedio, c.monto_base, 0) END,
               CASE WHEN c.naturaleza = 'ingreso'            THEN COALESCE(wd.moneda, 'ARS')
                    WHEN c.tarjeta_id IS NOT NULL
                    THEN CASE WHEN c.es_usd THEN 'USD' ELSE tar.moneda_iso END
                    ELSE NULL END,
               CASE WHEN c.tarjeta_id IS NOT NULL THEN 1 ELSE NULL END,
               c.fecha,
               NULL   -- sin nota automática: la nota la escribe el usuario, no el motor
          FROM candidatas c
          -- Solo las filas viejas con promedio histórico: promedio de los 3 meses
          -- anteriores a cada ocurrencia (no a hoy).
          LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(pc.valor_egreso) / 3.0, c.monto_base) AS promedio
                  FROM public.p_caja pc
                 WHERE pc.user_id = c.user_id
                   AND pc.estructura_egreso_id = c.estructura_egreso_id
                   AND pc.fecha >= c.fecha - INTERVAL '3 months'
                   AND pc.fecha <  c.fecha) prom
            ON c.tipo_variabilidad <> 'fijo' AND c.naturaleza = 'egreso'
          LEFT JOIN public.p_tarjetas_credito tar ON tar.tarjeta_id = c.tarjeta_id
          LEFT JOIN public.p_billeteras      wd  ON wd.billetera_id = c.billetera_destino_id
        ON CONFLICT (recurrente_id, fecha) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_insertados FROM ins;

    -- El puntero avanza al día siguiente de HOY, nunca al de fecha_fin: si se
    -- avanzara hasta después de la vigencia, el puntero quedaría más allá del
    -- último día válido y la recurrencia no volvería a generar nunca (bug real:
    -- una semanal con fin de mes saltó del 4 al 2 del mes siguiente y se quedó
    -- muda). Cuando ya no queda ninguna fecha dentro de la vigencia, el puntero
    -- queda en NULL.
    UPDATE public.p_gastos_recurrentes r
       SET proxima_ocurrencia = CASE
               WHEN nx.prox IS NULL THEN NULL
               WHEN r.fecha_fin IS NOT NULL AND nx.prox > r.fecha_fin THEN NULL
               ELSE nx.prox
           END
      FROM (
            SELECT r2.recurrente_id,
                   public.fn_recurrente_proxima_ocurrencia(
                       r2.modo, r2.dias_semana, r2.dias_mes, r2.fechas_anio,
                       r2.fecha_unica, r2.tarjeta_id, v_hoy + 1) AS prox
              FROM public.p_gastos_recurrentes r2
             WHERE r2.user_id = v_user_id
               AND r2.activo IS TRUE
               AND r2.proxima_ocurrencia IS NOT NULL
               AND r2.proxima_ocurrencia <= LEAST(v_hoy, COALESCE(r2.fecha_fin, v_hoy))
           ) nx
     WHERE r.recurrente_id = nx.recurrente_id;

    -- Vencidas: se pausan sin perder nada de lo ya generado.
    UPDATE public.p_gastos_recurrentes
       SET activo = false, motivo_pausa = 'vencida', pausado_at = now()
     WHERE user_id = v_user_id
       AND activo IS TRUE
       AND ((fecha_fin IS NOT NULL AND fecha_fin < v_hoy)
            OR (modo = 'unica' AND fecha_unica IS NOT NULL AND fecha_unica < v_hoy));

    RETURN v_insertados;
END;
$function$;

COMMIT;
