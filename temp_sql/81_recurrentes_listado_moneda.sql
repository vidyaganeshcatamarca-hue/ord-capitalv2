-- =============================================================================
-- 81 — Recurrentes: el listado devuelve la moneda del monto
--
-- La tarjeta del recurrente mostraba «1.500 · días 28» sin decir en qué
-- moneda. La moneda no es del usuario ni del recurrente: es la del origen del
-- dinero (la billetera elegida, o la tarjeta si el pago va con tarjeta).
--
-- Se agrega `moneda` al final del RETURNS TABLE, así que la función se
-- recrea: DROP + CREATE dentro de la misma transacción para que no exista un
-- instante en que el RPC no esté disponible.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_listar_gastos_recurrentes();

CREATE OR REPLACE FUNCTION public.fn_listar_gastos_recurrentes()
 RETURNS TABLE(recurrente_id bigint, nombre text, nombre_categoria text, icono text, monto_base numeric, dia_del_mes integer, frecuencia text, tipo_variabilidad text, billetera_nombre text, activo boolean, billetera_defecto_id bigint, estructura_egreso_id bigint, modo text, dias_semana smallint[], dias_mes smallint[], fechas_anio smallint[], motivo_pausa text, pausado_at timestamp with time zone, ocurrencias_pendientes integer, fecha_unica date, fecha_fin date, tarjeta_id bigint, tarjeta_nombre text, es_usd boolean, moneda text)
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
        COALESCE(r.nombre_custom, e.nombre_cuenta) AS nombre,
        e.nombre_cuenta,
        e.icono,
        r.monto_base,
        r.dia_del_mes,
        r.frecuencia,
        r.tipo_variabilidad,
        b.nombre                                     AS billetera_nombre,
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
            WHEN b.moneda IS NOT NULL                 THEN b.moneda
            WHEN tj.moneda_iso IS NOT NULL            THEN tj.moneda_iso
            ELSE 'ARS'
        END                                          AS moneda
    FROM public.p_gastos_recurrentes r
    LEFT JOIN public.p_estructuras_egresos e ON r.estructura_egreso_id = e.estructura_id
    LEFT JOIN public.p_billeteras          b ON r.billetera_defecto_id = b.billetera_id
    LEFT JOIN public.p_tarjetas_credito  tj ON r.tarjeta_id = tj.tarjeta_id
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

COMMIT;
