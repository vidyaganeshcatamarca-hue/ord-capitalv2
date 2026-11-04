-- =============================================================================
-- 75 — Motor de recurrentes: disparo al abrir la app, con puntero
--
-- Decisión del dueño (tanda 8, punto 2): se descarta el cron global diario.
-- El motor corre por usuario cuando la app abre, una vez por día, y resuelve
-- únicamente el atraso de ESE usuario. Con 200.000 usuarios el costo pasa a
-- depender del uso y no del padrón.
--
-- Cómo se acuerda qué generar: una columna `proxima_ocurrencia` por recurrente
-- (el "desde" es el alta; el puntero avanza hacia adelante). No se recalcula el
-- pasado, así que lo que el usuario rechazó no vuelve.
--
-- Qué agrega este archivo:
--   1. fn_recurrente_proxima_ocurrencia(): la aritmética de fechas en un solo lugar.
--   2. p_gastos_recurrentes.proxima_ocurrencia + backfill desde hoy.
--   3. Índice único (recurrente_id, fecha) en p_caja_cuarentena: el antiduplicado
--      deja de ser un EXISTS y pasa a ser una garantía de la base.
--   4. fn_generar_recurrentes_usuario(): el motor por usuario, con el atraso
--      completo (sin tope) en una sola pasada.
--   5. fn_crear_gasto_recurrente y fn_editar_gasto_recurrente: inicializan y
--      recalculan el puntero. La edición lo recalcula DESDE HOY a propósito.
--
-- NO se borra fn_generar_recurrentes_hoy(): queda como herramienta de backfill
-- manual. Ojo: esa función vieja todavía no mueve el puntero, así que si se
-- corre a mano hay que recalcularlo después.
--
-- Idempotente y en UNA transacción.
--
-- OJO: si reaplicás este archivo, las dos RPC de abajo ya incluyen el parche del
-- 74 (semanal 1..7, mensual 1..31, tarjeta sin día). La primera versión de este
-- archivo se generó con las definiciones viejas y las revirtió: por eso existe
-- el 76, que es la reparación aplicada sobre la base viva.
-- =============================================================================

BEGIN;

-- ---------- 1. La próxima fecha del patrón, en un solo lugar ----------
-- Devuelve la primera ocurrencia del patrón que caiga en la fecha p_desde o
-- después. NULL = no hay más (una única vez ya pasada, tarjeta inexistente).
-- Vive acá y no repetida en cada RPC para que el motor, el alta y la edición
-- no puedan divergir en la aritmética de fechas.
CREATE OR REPLACE FUNCTION public.fn_recurrente_proxima_ocurrencia(
    p_modo         text,
    p_dias_semana  smallint[] DEFAULT NULL,
    p_dias_mes     smallint[] DEFAULT NULL,
    p_fechas_anio  smallint[] DEFAULT NULL,
    p_fecha_unica  date       DEFAULT NULL,
    p_tarjeta_id   bigint     DEFAULT NULL,
    p_desde        date       DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_desde  date := COALESCE(p_desde, CURRENT_DATE);
    v_cierre int;
    v_aviso  date;
    v_mes    date;
    v_res    date;
    i        int;
BEGIN
    IF p_modo = 'unica' THEN
        RETURN CASE WHEN p_fecha_unica IS NOT NULL AND p_fecha_unica >= v_desde
                    THEN p_fecha_unica END;
    END IF;

    -- Tarjeta: el día no lo decide el patrón sino el CIERRE (aviso = cierre - 3).
    -- Se prueban 15 meses para cubrir el arrastre cuando el cierre es día 1..3.
    IF p_tarjeta_id IS NOT NULL THEN
        SELECT t.dia_cierre INTO v_cierre
          FROM public.p_tarjetas_credito t WHERE t.tarjeta_id = p_tarjeta_id;
        IF v_cierre IS NULL THEN
            RETURN NULL;
        END IF;
        FOR i IN 0..14 LOOP
            v_mes := (date_trunc('month', v_desde) + (i || ' months')::interval)::date;
            v_aviso := v_mes
                       + (LEAST(v_cierre,
                                EXTRACT(DAY FROM (v_mes + INTERVAL '1 month' - INTERVAL '1 day'))::int
                               ) - 1) * INTERVAL '1 day'
                       - INTERVAL '3 days';
            IF v_aviso >= v_desde THEN
                RETURN v_aviso;
            END IF;
        END LOOP;
        RETURN NULL;
    END IF;

    -- Billetera: se busca el primer día que cumpla el patrón, con el recorte al
    -- último día del mes (30 y 31 en febrero caen los dos el 28 y dan UNA fecha).
    SELECT min(d)::date INTO v_res
      FROM generate_series(v_desde::timestamp,
                           (v_desde + INTERVAL '400 days')::timestamp,
                           INTERVAL '1 day') AS d
     WHERE (p_modo = 'semanal'
            AND EXTRACT(ISODOW FROM d)::int = ANY (COALESCE(p_dias_semana, '{}'::smallint[])))
        OR (p_modo = 'mensual'
            AND EXISTS (SELECT 1 FROM unnest(COALESCE(p_dias_mes, '{}'::smallint[])) AS x(valor)
                         WHERE LEAST(x.valor::int,
                                     EXTRACT(DAY FROM (date_trunc('month', d)
                                                       + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                    ) = EXTRACT(DAY FROM d)::int))
        OR (p_modo = 'anual'
            AND EXISTS (SELECT 1 FROM unnest(COALESCE(p_fechas_anio, '{}'::smallint[])) AS f(valor)
                         WHERE (f.valor / 100)::int = EXTRACT(MONTH FROM d)::int
                           AND LEAST((f.valor % 100)::int,
                                     EXTRACT(DAY FROM (date_trunc('month', d)
                                                       + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                    ) = EXTRACT(DAY FROM d)::int));
    RETURN v_res;
END;
$function$;

-- ---------- 2. El puntero: una fecha por recurrente ----------
ALTER TABLE public.p_gastos_recurrentes
    ADD COLUMN IF NOT EXISTS proxima_ocurrencia date;

COMMENT ON COLUMN public.p_gastos_recurrentes.proxima_ocurrencia IS
    'Primera ocurrencia que todavía NO se generó. El motor la avanza a medida que
     genera; el alta la inicializa en hoy y la edición la recalcula desde hoy.';

-- Punto de partida para las filas que ya existen: la primera fecha desde hoy,
-- así el día del despliegue nadie recibe un historial de golpe.
UPDATE public.p_gastos_recurrentes r
   SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
           r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
           r.fecha_unica, r.tarjeta_id, CURRENT_DATE)
 WHERE r.proxima_ocurrencia IS NULL AND r.activo IS TRUE;

-- ---------- 3. Antiduplicado real ----------
-- Hoy el «no lo generé» es un EXISTS: dos pestañas abiertas al mismo tiempo
-- insertan la misma ocurrencia dos veces. Las filas de voz/otras no tienen
-- recurrente_id, y en un índice único los NULL no chocan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS p_caja_cuarentena_recurrente_fecha_uidx
    ON public.p_caja_cuarentena (recurrente_id, fecha);

-- ---------- 4. El motor, por usuario ----------
-- Reemplaza al cron global: se llama al abrir la app, una vez por día, y
-- resuelve SOLO el usuario de la sesión. Sin barrido de la tabla completa y sin
-- recalcular el pasado: arranca en proxima_ocurrencia y avanza el puntero.
CREATE OR REPLACE FUNCTION public.fn_generar_recurrentes_usuario(
    p_hoy date DEFAULT NULL
) RETURNS integer
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
            estructura_egreso_id, monto, moneda, cuotas, fecha, detalle)
        SELECT c.user_id,
               'recurrente',
               CASE WHEN c.tarjeta_id IS NOT NULL THEN 'card_expense' ELSE 'expense' END,
               c.recurrente_id,
               c.tarjeta_id,
               CASE WHEN c.tarjeta_id IS NOT NULL THEN NULL ELSE c.billetera_defecto_id END,
               c.estructura_egreso_id,
               CASE WHEN c.tipo_variabilidad = 'fijo'
                    THEN COALESCE(c.monto_base, 0)
                    ELSE COALESCE(prom.promedio, c.monto_base, 0) END,
               CASE WHEN c.tarjeta_id IS NOT NULL
                    THEN CASE WHEN c.es_usd THEN 'USD' ELSE tar.moneda_iso END
                    ELSE NULL END,
               CASE WHEN c.tarjeta_id IS NOT NULL THEN 1 ELSE NULL END,
               c.fecha,
               'recurring_expense'
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
            ON c.tipo_variabilidad <> 'fijo'
          LEFT JOIN public.p_tarjetas_credito tar ON tar.tarjeta_id = c.tarjeta_id
        ON CONFLICT (recurrente_id, fecha) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_insertados FROM ins;

    -- El puntero avanza hasta después de la ventana que se acaba de resolver.
    UPDATE public.p_gastos_recurrentes r
       SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
               r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
               r.fecha_unica, r.tarjeta_id,
               GREATEST(v_hoy, COALESCE(r.fecha_fin, v_hoy)) + 1)
     WHERE r.user_id = v_user_id
       AND r.activo IS TRUE
       AND r.proxima_ocurrencia IS NOT NULL
       AND r.proxima_ocurrencia <= LEAST(v_hoy, COALESCE(r.fecha_fin, v_hoy));

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

COMMIT;
