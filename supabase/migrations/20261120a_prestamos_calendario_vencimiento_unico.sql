-- 20261120a_prestamos_calendario_vencimiento_unico.sql
--
-- T25 / S25. fn_prestamos_calendario only read p_prestamos_cuotas, so a loan with
-- modalidad = 'vencimiento_unico' never reached the calendar: it has no schedule,
-- and its agreed date lives in p_prestamos.proximo_vencimiento. Functional walk
-- 2026-11-20 confirmed it: the single-due-date loan was the only missing modality.
--
-- What this adds:
--   * one event per vencimiento_unico loan with a non-null proximo_vencimiento,
--     dated on that agreed date, with the loan's real prestamo_id in its own
--     column and cuota_id NULL — the id is never carried only inside a string;
--   * monto is the remaining balance, because the whole debt falls due that day
--     (an installment event carries one installment instead);
--   * 'pagado' uses the same arithmetic idea, saldo_actual <= 0, never a flag.
--
-- What it deliberately does NOT change:
--   * how installments are emitted: the first RETURN QUERY below is the deployed
--     body untouched, same columns, same filters, same order, same 'cuota_prestamo'
--     tipo_evento;
--   * modalidad = 'libre' still emits NOTHING. Such a loan has no agreed date and
--     none may be invented (P2, P15, S25).
--
-- The new tipo_evento value is 'vencimiento_prestamo', not 'cuota_prestamo':
-- a single due date is not an installment, and the only consumer of this function
-- (src/components/prestamos/PrestamosCalendario.tsx) builds its event from the row
-- regardless of tipo_evento. Consumers of the legacy fn_reporte_calendario_financiero
-- are a different function and are unaffected.
--
-- Return type is unchanged, so CREATE OR REPLACE keeps the existing grants.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_prestamos_calendario(
    p_dias_adelante integer DEFAULT 30
) RETURNS TABLE (
    tipo_evento     text,
    fecha           date,
    nombre          text,
    monto           numeric,
    moneda          text,
    direccion       text,
    criticidad      text,
    pagado          boolean,
    prestamo_id     bigint,
    cuota_id        bigint,
    numero_cuota    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_hasta   date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    v_hasta := CURRENT_DATE + GREATEST(COALESCE(p_dias_adelante, 30), 0);

    -- 1. Installments. Unchanged from the deployed body.
    RETURN QUERY
    WITH pagos AS (
        SELECT g.prestamo_id, SUM(g.monto_aplicado) AS aplicado
        FROM public.p_prestamos_pagos g
        WHERE g.estado = 'activo'
        GROUP BY g.prestamo_id
    ),
    programadas AS (
        SELECT c.prestamo_id,
               c.cuota_id,
               c.numero_cuota,
               c.fecha_vencimiento,
               c.monto_cuota,
               SUM(c.monto_cuota) OVER (
                   PARTITION BY c.prestamo_id
                   ORDER BY c.fecha_vencimiento, c.numero_cuota
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS acumulado
        FROM public.p_prestamos_cuotas c
    )
    SELECT 'cuota_prestamo'::text,
           pr.fecha_vencimiento,
           COALESCE(p.nombre_prestamo, p.entidad_nombre)::text,
           pr.monto_cuota,
           trim(p.moneda_iso)::text,
           p.tipo_flujo::text,
           CASE WHEN pr.fecha_vencimiento <  CURRENT_DATE       THEN 'vencido'::text
                WHEN pr.fecha_vencimiento <= CURRENT_DATE + 3   THEN 'critico'::text
                WHEN pr.fecha_vencimiento <= CURRENT_DATE + 10  THEN 'atencion'::text
                ELSE 'normal'::text END,
           -- Payments apply freely to the total balance (§4.1), so an installment
           -- counts as covered once what has been paid reaches its cumulative
           -- amount. Same arithmetic as the overdue formula, never a stored flag.
           (pr.acumulado <= COALESCE(pg.aplicado, 0)),
           p.prestamo_id,
           pr.cuota_id,
           pr.numero_cuota
    FROM programadas pr
    JOIN public.p_prestamos p ON p.prestamo_id = pr.prestamo_id
    LEFT JOIN pagos pg ON pg.prestamo_id = pr.prestamo_id
    WHERE p.user_id = v_user_id
      AND p.estado IN ('activo', 'pendiente', 'parcial')
      AND p.eliminado_at IS NULL
      AND pr.fecha_vencimiento <= v_hasta
    ORDER BY pr.fecha_vencimiento, p.prestamo_id, pr.numero_cuota;

    -- 2. Single due date. One event, on the agreed date, with no cuota.
    --    'libre' is excluded on purpose: it has no agreed date (S25).
    RETURN QUERY
    SELECT 'vencimiento_prestamo'::text,
           p.proximo_vencimiento,
           COALESCE(p.nombre_prestamo, p.entidad_nombre)::text,
           p.saldo_actual,
           trim(p.moneda_iso)::text,
           p.tipo_flujo::text,
           CASE WHEN p.proximo_vencimiento <  CURRENT_DATE       THEN 'vencido'::text
                WHEN p.proximo_vencimiento <= CURRENT_DATE + 3   THEN 'critico'::text
                WHEN p.proximo_vencimiento <= CURRENT_DATE + 10  THEN 'atencion'::text
                ELSE 'normal'::text END,
           (p.saldo_actual <= 0),
           p.prestamo_id,
           NULL::bigint,
           NULL::integer
    FROM public.p_prestamos p
    WHERE p.user_id = v_user_id
      AND p.estado IN ('activo', 'pendiente', 'parcial')
      AND p.eliminado_at IS NULL
      AND p.modalidad = 'vencimiento_unico'
      AND p.proximo_vencimiento IS NOT NULL
      AND p.proximo_vencimiento <= v_hasta
    ORDER BY p.proximo_vencimiento, p.prestamo_id;
END;
$$;

COMMENT ON FUNCTION public.fn_prestamos_calendario IS
    'Loan events for the financial calendar. Installments arrive as cuota_prestamo with prestamo_id and cuota_id as explicit columns; single-due-date loans arrive as vencimiento_prestamo dated on proximo_vencimiento with cuota_id NULL. Loans with modality libre never appear: no agreed date may be invented. No consumer parses an identifier out of a string.';

COMMIT;
