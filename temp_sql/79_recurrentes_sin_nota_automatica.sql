-- =============================================================================
-- 79 — Recurrentes: el motor NO escribe nota automática
--
-- El motor insertaba `detalle = 'recurring_expense'` en la ocurrencia, y la
-- bandeja muestra `detalle` como la nota del movimiento: aparecía «la key
-- desnuda» en pantalla y, peor, el movimiento aprobado se quedaba con una nota
-- que el usuario nunca escribió.
--
-- Ahora la ocurrencia nace SIN detalle. Si el usuario quiere una nota, la
-- escribe él en la bandeja.
--
-- Incluye la limpieza de las filas que ya quedaron con el marcador (bandeja y
-- movimientos aprobados).
-- =============================================================================

BEGIN;

UPDATE public.p_caja_cuarentena
   SET detalle = NULL
 WHERE detalle = 'recurring_expense';

UPDATE public.p_caja
   SET detalle = NULL
 WHERE detalle = 'recurring_expense';

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
            ON c.tipo_variabilidad <> 'fijo'
          LEFT JOIN public.p_tarjetas_credito tar ON tar.tarjeta_id = c.tarjeta_id
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
