-- Transactional verification of T25 / S25: single-due-date loans in the calendar.
--
-- Runs inside BEGIN ... ROLLBACK. The fixture lives on a throwaway user created
-- inside the transaction (random auth_id), so no real user's rows are read or
-- written and nothing survives the ROLLBACK.
--
-- Proves:
--   A1  a vencimiento_unico loan with proximo_vencimiento emits EXACTLY one event,
--       dated on that agreed date, with prestamo_id filled as a real column and
--       cuota_id NULL (the id is never carried only inside a string)
--   A2  a libre loan emits NOTHING: it has no agreed date and none is invented
--   A3  an installments loan still emits exactly one event per cuota, unchanged
--   A4  the three fixtures together produce exactly 4 events (1 + 0 + 3), so the
--       new branch neither duplicates nor swallows existing events
--
-- Deliberately NOT asserted: that the single-due-date amount equals a particular
-- formula beyond the remaining balance. That is a product decision recorded in
-- 20261120a, not an invariant of the id contract.

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth     uuid;
    v_user     bigint;
    v_unico    bigint;
    v_libre    bigint;
    v_cuotas   bigint;
    v_dia      date := CURRENT_DATE + 12;
    v_n        integer;
    v_tipo     text;
    v_fecha    date;
    v_prestamo bigint;
    v_cuota    bigint;
    v_monto    numeric;
    v_saldo    numeric;
    v_nulos    integer;
    v_cuota_ok integer;
    v_fechas   date[];
BEGIN
    -- ---- Fixture: a throwaway user, created and rolled back ----------------
    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app, tipo_sistema)
    VALUES ('TEST_S25_vencimiento_unico',
            'test_s25_' || replace(gen_random_uuid()::text, '-', ''),
            'not-a-real-password',
            gen_random_uuid(),
            now() - interval '90 days',
            'simple',
            'personal')
    RETURNING user_id, auth_id INTO v_user, v_auth;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth)::text, true);

    -- Single due date, agreed date inside the window, money still owed.
    v_unico := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'TEST_S25_Unico', p_moneda => 'ARS',
        p_monto_original => 80000, p_modalidad => 'vencimiento_unico',
        p_es_historico => true, p_saldo_al_ingreso => 80000,
        p_proximo_vencimiento => v_dia);

    -- Free modality: no schedule, no agreed date. Must stay out.
    v_libre := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'TEST_S25_Libre', p_moneda => 'ARS',
        p_monto_original => 5000, p_modalidad => 'libre',
        p_es_historico => true, p_saldo_al_ingreso => 5000);

    -- Installments: the existing behaviour that must not change.
    v_cuotas := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'TEST_S25_Cuotas', p_moneda => 'ARS',
        p_monto_original => 30000, p_modalidad => 'cuotas',
        p_es_historico => true, p_saldo_al_ingreso => 30000,
        p_cuotas => jsonb_build_array(
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 5,  'monto_cuota', 10000),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 20, 'monto_cuota', 10000),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 40, 'monto_cuota', 10000)));

    -- ---- A1: single due date emits one event on the agreed date -----------
    SELECT count(*),
           max(c.tipo_evento), max(c.fecha), max(c.prestamo_id),
           count(*) FILTER (WHERE c.cuota_id IS NOT NULL),
           max(c.monto)
      INTO v_n, v_tipo, v_fecha, v_prestamo, v_nulos, v_monto
    FROM public.fn_prestamos_calendario(60) c
    WHERE c.prestamo_id = v_unico;

    SELECT saldo_actual INTO v_saldo FROM public.p_prestamos WHERE prestamo_id = v_unico;

    INSERT INTO t_resultado VALUES (1,
        'A1 un prestamo vencimiento_unico emite exactamente un evento en su fecha pactada',
        (v_n = 1 AND v_tipo = 'vencimiento_prestamo' AND v_fecha = v_dia),
        format('eventos=%s tipo=%s fecha=%s esperada=%s', v_n, v_tipo, v_fecha, v_dia));

    INSERT INTO t_resultado VALUES (2,
        'A1 el evento lleva el prestamo_id en su columna y cuota_id nulo',
        (v_prestamo = v_unico AND v_nulos = 0),
        format('prestamo_id=%s esperado=%s eventos_con_cuota_id=%s', v_prestamo, v_unico, v_nulos));

    INSERT INTO t_resultado VALUES (3,
        'A1 el importe del evento es el saldo que vence ese dia',
        (v_monto IS NOT NULL AND v_monto = v_saldo),
        format('monto=%s saldo_pendiente=%s', v_monto, v_saldo));

    -- ---- A2: libre emits nothing -------------------------------------------
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(60) c
    WHERE c.prestamo_id = v_libre;

    INSERT INTO t_resultado VALUES (4,
        'A2 un prestamo libre no emite ningun evento',
        (v_n = 0), format('eventos=%s', v_n));

    -- ---- A3: installments unchanged ----------------------------------------
    SELECT count(*),
           count(*) FILTER (WHERE c.tipo_evento = 'cuota_prestamo'),
           count(*) FILTER (WHERE c.cuota_id IS NULL),
           array_agg(c.fecha ORDER BY c.fecha)
      INTO v_n, v_cuota_ok, v_nulos, v_fechas
    FROM public.fn_prestamos_calendario(60) c
    WHERE c.prestamo_id = v_cuotas;

    INSERT INTO t_resultado VALUES (5,
        'A3 un prestamo en cuotas sigue emitiendo un evento por cuota, con su cuota_id',
        (v_n = 3 AND v_nulos = 0
         AND v_fechas = ARRAY[CURRENT_DATE + 5, CURRENT_DATE + 20, CURRENT_DATE + 40]),
        format('eventos=%s sin_cuota_id=%s fechas=%s', v_n, v_nulos, v_fechas));

    INSERT INTO t_resultado VALUES (6,
        'A3 el tipo de evento de las cuotas sigue siendo cuota_prestamo',
        (v_cuota_ok = 3), format('eventos_cuota_prestamo=%s', v_cuota_ok));

    -- ---- A4: no duplication, no swallowing ---------------------------------
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(60) c
    WHERE c.prestamo_id IN (v_unico, v_libre, v_cuotas);

    INSERT INTO t_resultado VALUES (7,
        'A4 los tres prestamos de prueba producen 1 + 0 + 3 eventos, sin duplicar',
        (v_n = 4), format('eventos=%s esperados=4', v_n));

    -- ---- A5: the single due date is out of range when the date is ---------
    -- The window still governs: nothing is emitted for a date beyond p_dias_adelante.
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(1) c
    WHERE c.prestamo_id = v_unico;

    INSERT INTO t_resultado VALUES (8,
        'A5 la fecha pactada respeta la ventana de dias, no se emite fuera de rango',
        (v_n = 0), format('eventos_con_ventana_1_dia=%s', v_n));
END $$;

SELECT CASE WHEN bool_and(ok) THEN 'PASS' ELSE 'FAIL' END AS result,
       jsonb_agg(jsonb_build_object('assertion', assertion, 'ok', ok, 'detalle', detalle)
                 ORDER BY orden) AS detail
FROM t_resultado;

ROLLBACK;
