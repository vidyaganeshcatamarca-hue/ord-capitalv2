-- =============================================================================
-- 172 - Recurrentes: la programacion se calcula SIEMPRE en hora local
--
-- Decision del dueno: la programacion de los recurrentes se piensa en el dia
-- del USUARIO. UTC queda para lo que ya lo usa a proposito (telemetria, sellos
-- pausado_at/creado_at), no para decidir que dia es hoy.
--
-- El problema, medido contra la base viva (TimeZone = UTC):
--   a las 22:30 de Argentina el servidor ya esta en el dia siguiente,
--   ('2026-11-06 22:30-03' at time zone 'UTC')::date = 2026-11-07
-- y el alta anclaba el puntero con CURRENT_DATE, o sea con el 7. Con un patron
-- mensual dia 6, fn_recurrente_proxima_ocurrencia(..., '2026-11-07') devuelve
-- 2026-12-06: la ocurrencia de HOY se pierde. En modo 'unica' con fecha hoy
-- devuelve NULL y la ocurrencia no se genera nunca.
--
-- Que cambia:
--   1. fn_crear_gasto_recurrente   + p_fecha_base  -> ancla el puntero
--   2. fn_editar_gasto_recurrente  + p_fecha_base  -> recalcula el puntero
--   3. fn_pausar_gasto_recurrente  + p_fecha_base  -> recalcula al reactivar
--   4. fn_generar_recurrentes_hoy  + p_hoy         -> herramienta de backfill
--      manual (no la llama la app, solo comentarios); recibe el dia y el resto
--      de sus lecturas del reloj usan ese dia.
-- El motor fn_generar_recurrentes_usuario ya recibia p_hoy del cliente desde la
-- migracion 75: no se toca.
--
-- Los tres primeros reciben la fecha con DEFAULT NULL y caen en CURRENT_DATE si
-- el cliente no la manda: el bundle que esta en produccion sigue llamando con
-- 18/21/3 argumentos y NO se rompe durante el deploy.
--
-- SOBRECARGAS: se borran las que quedaron de la migracion 82 (crear de 15 y 18
-- argumentos, editar de 18 y 21). Verificado antes de dropear:
--   · ninguna funcion de la base las referencia (pg_proc.prosrc sin coincidencias);
--   · el unico llamador de la app es src/hooks/useGastosRecurrentes.ts (lineas 29
--     y 58) y manda TODOS los parametros, asi que resuelve por nombre contra la
--     firma nueva;
--   · fn_generar_recurrentes_hoy no la llama nadie: cero llamadas en src/, api/,
--     scripts/ y tests/ (solo la mencionan dos comentarios).
-- Sin los DROP quedarian dos o tres sobrecargas por nombre y PostgREST no podria
-- elegir candidata, que es exactamente el bug de fn_configurar_formato_moneda
-- (migracion 170).
--
-- Idempotente: DROP IF EXISTS + CREATE OR REPLACE, en UNA transaccion.
-- =============================================================================

BEGIN;

-- ---------- 1. Fuera las sobrecargas viejas ----------
DROP FUNCTION IF EXISTS public.fn_crear_gasto_recurrente(p_estructura_egreso_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer, p_frecuencia text, p_tipo_variabilidad text, p_billetera_defecto_id bigint, p_modo text, p_dias_semana integer[], p_dias_mes integer[], p_fechas_anio integer[], p_fecha_unica date, p_fecha_fin date, p_tarjeta_id bigint, p_es_usd boolean);
DROP FUNCTION IF EXISTS public.fn_crear_gasto_recurrente(p_estructura_egreso_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer, p_frecuencia text, p_tipo_variabilidad text, p_billetera_defecto_id bigint, p_modo text, p_dias_semana integer[], p_dias_mes integer[], p_fechas_anio integer[], p_fecha_unica date, p_fecha_fin date, p_tarjeta_id bigint, p_es_usd boolean, p_naturaleza text, p_estructura_ingreso_id bigint, p_billetera_destino_id bigint);
DROP FUNCTION IF EXISTS public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer, p_frecuencia text, p_tipo_variabilidad text, p_billetera_defecto_id bigint, p_activo boolean, p_modo text, p_dias_semana integer[], p_dias_mes integer[], p_fechas_anio integer[], p_motivo_pausa text, p_fecha_unica date, p_fecha_fin date, p_tarjeta_id bigint, p_es_usd boolean, p_estructura_egreso_id bigint);
DROP FUNCTION IF EXISTS public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer, p_frecuencia text, p_tipo_variabilidad text, p_billetera_defecto_id bigint, p_activo boolean, p_modo text, p_dias_semana integer[], p_dias_mes integer[], p_fechas_anio integer[], p_motivo_pausa text, p_fecha_unica date, p_fecha_fin date, p_tarjeta_id bigint, p_es_usd boolean, p_estructura_egreso_id bigint, p_naturaleza text, p_estructura_ingreso_id bigint, p_billetera_destino_id bigint);
DROP FUNCTION IF EXISTS public.fn_generar_recurrentes_hoy();
DROP FUNCTION IF EXISTS public.fn_pausar_gasto_recurrente(p_recurrente_id bigint, p_activo boolean, p_motivo_pausa text);


-- ---------- 2. Las cuatro funciones, con el dia del usuario ----------

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_motivo_pausa text DEFAULT NULL::text, p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_naturaleza text DEFAULT NULL::text, p_estructura_ingreso_id bigint DEFAULT NULL::bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_fecha_base date DEFAULT NULL::date)
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
               r.fecha_unica, r.tarjeta_id, COALESCE(p_fecha_base, CURRENT_DATE))
     WHERE r.recurrente_id = p_recurrente_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_pausar_gasto_recurrente(p_recurrente_id bigint, p_activo boolean, p_motivo_pausa text DEFAULT NULL::text, p_fecha_base date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_motivo  text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_activo IS FALSE THEN
        v_motivo := COALESCE(p_motivo_pausa, 'pausado_por_usuario');
        IF v_motivo NOT IN ('pausado_por_usuario','billetera_eliminada',
                            'categoria_movida','subcuenta_creada') THEN
            RAISE EXCEPTION '{"key": "error_recurrent_motivo_invalid", "params": {}}';
        END IF;
    ELSE
        v_motivo := NULL;   -- reactivar limpia la razón y el sello de tiempo
    END IF;

    UPDATE public.p_gastos_recurrentes
       SET activo       = p_activo,
           motivo_pausa = v_motivo,
           pausado_at   = CASE WHEN p_activo IS FALSE THEN now() ELSE NULL END
     WHERE recurrente_id = p_recurrente_id
       AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;

    -- Pausar significa «no lo generes»: al reactivar, el puntero se recalcula
    -- desde HOY. Sin esto, una recurrencia pausada tres meses generaría todo ese
    -- atraso de golpe en la primera apertura después de reactivarla.
    IF p_activo IS TRUE THEN
        UPDATE public.p_gastos_recurrentes r
           SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
                   r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
                   r.fecha_unica, r.tarjeta_id, COALESCE(p_fecha_base, CURRENT_DATE))
         WHERE r.recurrente_id = p_recurrente_id;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generar_recurrentes_hoy(p_hoy date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r_rec            RECORD;
    v_monto          numeric;
    v_hoy            date := COALESCE(p_hoy, CURRENT_DATE);
    v_dia_hoy        int  := EXTRACT(DAY FROM v_hoy)::int;
    v_mes_hoy        int  := EXTRACT(MONTH FROM v_hoy)::int;
    v_dow_hoy        int  := EXTRACT(ISODOW FROM v_hoy)::int;
    v_ultimo_dia_mes int  := EXTRACT(DAY FROM
                            (date_trunc('month', v_hoy) + INTERVAL '1 month' - INTERVAL '1 day'))::int;
    v_insertados     int  := 0;
    v_fallidos       int  := 0;
    v_vencidos       int  := 0;

    v_cierre         date;   -- cierre de la tarjeta (día del mes, recortado)
    v_aviso          date;   -- cierre - 3
    v_moneda         text;
BEGIN
    FOR r_rec IN
        SELECT * FROM public.p_gastos_recurrentes WHERE activo IS TRUE
    LOOP
        BEGIN
            -- ---------- vigencia vencida: se pausa y no se genera ----------
            IF r_rec.fecha_fin IS NOT NULL AND v_hoy > r_rec.fecha_fin THEN
                UPDATE public.p_gastos_recurrentes
                   SET activo = false, motivo_pausa = 'vencida', pausado_at = now()
                 WHERE recurrente_id = r_rec.recurrente_id AND activo IS TRUE;
                v_vencidos := v_vencidos + 1;
                CONTINUE;
            END IF;

            -- ================= RAMA TARJETA =================
            -- El día no lo decide el patrón del recurrente sino el CIERRE de la
            -- tarjeta: se propone 3 días antes de que cierre el ciclo.
            IF r_rec.tarjeta_id IS NOT NULL THEN
                SELECT LEAST(t.dia_cierre,
                             EXTRACT(DAY FROM (date_trunc('month', v_hoy)
                                               + INTERVAL '1 month' - INTERVAL '1 day'))::int),
                       COALESCE(t.moneda_iso, 'ARS')
                  INTO v_dia_hoy, v_moneda
                  FROM public.p_tarjetas_credito t
                 WHERE t.tarjeta_id = r_rec.tarjeta_id
                   AND t.user_id = r_rec.user_id;

                CONTINUE WHEN v_dia_hoy IS NULL;   -- tarjeta inexistente: se ignora

                -- modo unica: el ciclo que corresponde a su fecha
                IF r_rec.modo = 'unica' THEN
                    IF r_rec.fecha_unica IS NULL THEN CONTINUE; END IF;
                    -- primer cierre >= fecha_unica
                    v_cierre := (date_trunc('month', r_rec.fecha_unica)
                                 + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    IF r_rec.fecha_unica > v_cierre THEN
                        v_cierre := (date_trunc('month', r_rec.fecha_unica + INTERVAL '1 month')
                                     + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    END IF;
                ELSE
                    -- mensual: el próximo cierre desde hoy
                    v_cierre := (date_trunc('month', v_hoy)
                                 + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    IF v_hoy > v_cierre THEN
                        v_cierre := (date_trunc('month', v_hoy + INTERVAL '1 month')
                                     + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    END IF;
                END IF;

                v_aviso := v_cierre - 3;
                CONTINUE WHEN v_hoy <> v_aviso;

                -- idempotencia
                CONTINUE WHEN EXISTS (
                    SELECT 1 FROM public.p_caja_cuarentena c
                     WHERE c.recurrente_id = r_rec.recurrente_id
                       AND c.fecha = v_hoy);

                INSERT INTO public.p_caja_cuarentena (
                    user_id, origen, tipo, recurrente_id, tarjeta_id, billetera_id,
                    estructura_egreso_id, monto, moneda, cuotas, fecha, detalle)
                VALUES (
                    r_rec.user_id, 'recurrente', 'card_expense', r_rec.recurrente_id,
                    r_rec.tarjeta_id, NULL,
                    r_rec.estructura_egreso_id,
                    COALESCE(r_rec.monto_base, 0),
                    CASE WHEN r_rec.es_usd THEN 'USD' ELSE v_moneda END,
                    1, v_hoy, 'recurring_expense');

                v_insertados := v_insertados + 1;
                CONTINUE;
            END IF;

            -- ================= RAMA BILLETERA (sin cambios) =================
            IF r_rec.modo = 'unica' THEN
                CONTINUE WHEN r_rec.fecha_unica IS DISTINCT FROM v_hoy;
            ELSIF r_rec.modo = 'semanal' THEN
                CONTINUE WHEN v_dow_hoy <> ALL (COALESCE(r_rec.dias_semana, '{}'::smallint[]));
            ELSIF r_rec.modo = 'anual' THEN
                CONTINUE WHEN NOT EXISTS (
                    SELECT 1 FROM unnest(COALESCE(r_rec.fechas_anio, '{}'::smallint[])) AS f(valor)
                     WHERE (f.valor / 100)::int = v_mes_hoy
                       AND LEAST((f.valor % 100)::int, v_ultimo_dia_mes) = EXTRACT(DAY FROM v_hoy)::int);
            ELSE
                CONTINUE WHEN NOT EXISTS (
                    SELECT 1 FROM unnest(COALESCE(r_rec.dias_mes,
                                                  ARRAY[r_rec.dia_del_mes]::smallint[])) AS d(valor)
                     WHERE LEAST(d.valor::int, v_ultimo_dia_mes) = EXTRACT(DAY FROM v_hoy)::int);
            END IF;

            CONTINUE WHEN EXISTS (
                SELECT 1 FROM public.p_caja_cuarentena c
                 WHERE c.recurrente_id = r_rec.recurrente_id
                   AND c.fecha = v_hoy);

            IF r_rec.tipo_variabilidad = 'fijo' THEN
                v_monto := r_rec.monto_base;
            ELSE
                SELECT COALESCE(SUM(valor_egreso) / 3.0, r_rec.monto_base)
                  INTO v_monto
                  FROM public.p_caja
                 WHERE user_id = r_rec.user_id
                   AND estructura_egreso_id = r_rec.estructura_egreso_id
                   AND fecha >= v_hoy - INTERVAL '3 months';
            END IF;
            v_monto := COALESCE(v_monto, r_rec.monto_base, 0);

            INSERT INTO public.p_caja_cuarentena (
                user_id, origen, tipo, recurrente_id, billetera_id,
                estructura_egreso_id, monto, fecha, detalle)
            VALUES (
                r_rec.user_id, 'recurrente', 'expense', r_rec.recurrente_id,
                r_rec.billetera_defecto_id,
                r_rec.estructura_egreso_id, v_monto, v_hoy, 'recurring_expense');

            v_insertados := v_insertados + 1;

        EXCEPTION WHEN OTHERS THEN
            v_fallidos := v_fallidos + 1;
            RAISE WARNING 'fn_generar_recurrentes_hoy: recurrente % omitido: % (%)',
                r_rec.recurrente_id, SQLERRM, SQLSTATE;
        END;
    END LOOP;

    IF v_vencidos > 0 THEN
        RAISE NOTICE 'fn_generar_recurrentes_hoy: % recurrentes vencidos pausados', v_vencidos;
    END IF;
    IF v_fallidos > 0 THEN
        RAISE WARNING 'fn_generar_recurrentes_hoy: % ocurrencias insertadas, % omitidos',
            v_insertados, v_fallidos;
    END IF;

    RETURN v_insertados;
END;
$function$;

COMMIT;
