-- fn_exportar_movimientos v1 — approved by owner 2026 (with revision:
-- cross-currency transfers are NOT accepted by the import, so the export
-- emits them as their two legs (expense + income). No monto_destino column.
-- Read-only aggregator; scope = user rows only (parity with fn_buscar_movimientos).
-- Canonical columns: fecha | tipo | monto | bill_origen | bill_destino | cuenta | detalle.

CREATE OR REPLACE FUNCTION public.fn_exportar_movimientos(
  p_fecha_inicio date DEFAULT date_trunc('month', (CURRENT_DATE)::timestamp with time zone),
  p_fecha_fin date DEFAULT (date_trunc('month', (CURRENT_DATE)::timestamp with time zone) + interval '1 month' - interval '1 day')
)
RETURNS TABLE(fecha date, tipo text, monto numeric, bill_origen text, bill_destino text, cuenta text, detalle text)
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
    IF p_fecha_fin IS NULL THEN
        p_fecha_fin := p_fecha_inicio;
    END IF;

    RETURN QUERY
    -- 1) Simple rows (expense/income/transfer same-currency single row),
    --    excluding any cross-currency double-insert legs.
    WITH legs AS (
        SELECT c.p_caja_id, c.fecha, c.tipo, c.valor_egreso, c.valor_ingreso, c.detalle, c.metadata,
               bo.nombre AS nom_origen, bd.nombre AS nom_destino,
               e.nombre_cuenta AS nom_cuenta, pe.nombre_cuenta AS nom_padre,
               (COALESCE(c.metadata->>'transfer_double_insert', 'false') = 'true') AS es_pierna_cruzada
        FROM public.p_caja c
        JOIN public.p_billeteras bo ON bo.billetera_id = c.billetera_origen_id
        LEFT JOIN public.p_billeteras bd ON bd.billetera_id = c.billetera_destino_id
        LEFT JOIN public.p_estructuras_egresos e  ON e.estructura_id = c.estructura_egreso_id
        LEFT JOIN public.p_estructuras_egresos pe ON pe.estructura_id = e.padre_id
        WHERE c.user_id = v_user_id
          AND c.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
    ),
    legs_cuenta AS (
        SELECT l.*,
               -- Canonical account path: 'no_detail' collapses to the parent;
               -- with a parent, Padre-Sub using the import separator '-'.
               CASE
                   WHEN l.nom_cuenta = 'no_detail' AND l.nom_padre IS NOT NULL THEN l.nom_padre
                   WHEN l.nom_padre IS NOT NULL THEN l.nom_padre || '-' || l.nom_cuenta
                   ELSE l.nom_cuenta
               END::text AS cuenta_path
        FROM legs l
    )
    SELECT l.fecha, l.tipo,
           COALESCE(NULLIF(l.valor_egreso, 0), NULLIF(l.valor_ingreso, 0))::numeric AS monto,
           l.nom_origen::text, l.nom_destino::text,
           CASE WHEN l.tipo = 'expense' THEN l.cuenta_path ELSE NULL END::text AS cuenta,
           l.detalle::text AS detalle
    FROM legs_cuenta l
    WHERE NOT l.es_pierna_cruzada
    ORDER BY l.fecha, l.p_caja_id;

    RETURN QUERY
    -- 2) Cross-currency transfers as their two legs (pair rank-to-rank per
    --    fecha; the registrar inserts the expense leg and income leg
    --    consecutively in the same transaction).
    WITH legs AS (
        SELECT c.p_caja_id, c.fecha, c.tipo, c.valor_egreso, c.valor_ingreso, c.metadata,
               bo.nombre AS nom_origen,
               (COALESCE(c.metadata->>'transfer_double_insert', 'false') = 'true') AS es_pierna_cruzada
        FROM public.p_caja c
        JOIN public.p_billeteras bo ON bo.billetera_id = c.billetera_origen_id
        WHERE c.user_id = v_user_id
          AND c.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
    ),
    exp AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY fecha ORDER BY p_caja_id) AS rn
        FROM legs
        WHERE es_pierna_cruzada AND tipo = 'expense' AND valor_egreso > 0
    ),
    inc AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY fecha ORDER BY p_caja_id) AS rn
        FROM legs
        WHERE es_pierna_cruzada AND tipo = 'income' AND valor_ingreso > 0
    )
    SELECT inc.fecha, 'transfer'::text,
           exp.valor_egreso::numeric AS monto,
           exp.nom_origen::text AS bill_origen,
           inc.nom_origen::text AS bill_destino,
           NULL::text AS cuenta,
           COALESCE(inc.metadata->>'nota', exp.metadata->>'nota', '')::text AS detalle
    FROM inc
    JOIN exp ON exp.fecha = inc.fecha AND exp.rn = inc.rn
    ORDER BY inc.fecha, inc.p_caja_id;
END;
$function$;