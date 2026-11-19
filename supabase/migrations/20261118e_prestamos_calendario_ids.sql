-- Loans / saneamiento rebuild — stage 4 (T18): close the calendar id confusion.
--
-- The deployed fn_reporte_calendario_financiero builds the loan-installment event
-- as ('prestamo_' || cd.cuota_id). The prefix says "loan", the value is a cuota_id,
-- and the frontend turns it back into p_deuda_id. Any collision between
-- p_cuotas_detalle.cuota_id and p_prestamos.prestamo_id silently pays the wrong
-- loan.
--
-- Two separate actions, deliberately kept separate:
--
--   1. Patch the legacy event prefix so no consumer can parse a cuota id as a
--      loan id. Done by rewriting the deployed definition from
--      pg_get_functiondef, which touches only that string and leaves the card and
--      recurring-expense branches byte-identical. Idempotent.
--
--   2. Add fn_prestamos_calendario, which carries prestamo_id and cuota_id as
--      EXPLICIT columns. The rebuilt screen reads ids from columns and never
--      parses a string again.
--
-- What this does NOT do: the legacy loan branch still reads p_cuotas_detalle.prestamo_id,
-- which nothing writes, so it emits no rows. Removing that dead branch belongs to
-- retiring the legacy calendar, not to this fix.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Surgical prefix patch on the deployed definition
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_def   text;
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_reporte_calendario_financiero';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fn_reporte_calendario_financiero: se esperaba 1 sobrecarga y hay %', v_count;
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_reporte_calendario_financiero';

    IF position('''prestamo_'' || cd.cuota_id' IN v_def) = 0 THEN
        -- Either already patched, or the body changed shape. Never guess.
        IF position('''cuota_prestamo_'' || cd.cuota_id' IN v_def) > 0 THEN
            RAISE NOTICE 'prefijo ya reescrito, nada que hacer';
            RETURN;
        END IF;
        RAISE EXCEPTION 'no se encontro la construccion del evento de cuota de prestamo; revisar a mano';
    END IF;

    v_def := replace(
        v_def,
        '''prestamo_'' || cd.cuota_id',
        '''cuota_prestamo_'' || cd.cuota_id'
    );

    EXECUTE v_def;
    RAISE NOTICE 'prefijo de cuota de prestamo reescrito a cuota_prestamo_';
END $$;

-- ---------------------------------------------------------------------------
-- 2. New calendar contract for loans: ids in columns, never in strings
-- ---------------------------------------------------------------------------

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
END;
$$;

COMMENT ON FUNCTION public.fn_prestamos_calendario IS
    'Loan installment events for the financial calendar. Carries prestamo_id and cuota_id as explicit columns so no consumer ever has to parse an identifier out of a string.';

COMMIT;
