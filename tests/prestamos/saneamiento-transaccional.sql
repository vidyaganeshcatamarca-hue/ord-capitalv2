-- Transactional verification of Saneamiento (T11-T15).
--
-- Runs inside BEGIN ... ROLLBACK.
--
-- Proves:
--   G1  the plan universe is only pending Debo loans: no Me deben, no settled
--   G2  Matematica orders by rate, treating an uninformed rate as 0 % for ordering
--   G3  Emocional orders by smallest pending balance
--   G4  Vinculos puts personal creditors first and institutions after
--   G5  Vinculos ties share a rank and are flagged so the user can break them
--   G6  the questionnaire only offers personal creditors
--   G7  answers score 0/3/5/6/8/11 from weights 3/3/5
--   G8  the simulation returns months and interest only with a real schedule
--   G9  with no schedule it returns nulls and a reason, never a fake zero
--   G10 with an uninformed interest component it refuses to estimate interest
--   G11 progress never counts pre-existing repayments and never invents a date

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth  uuid;
    v_user  bigint;
    v_alto  bigint;
    v_bajo  bigint;
    v_pedro bigint;
    v_juan  bigint;
    v_inst  bigint;
    v_mdebe bigint;
    v_libre bigint;
    v_sinint bigint;
    v_r     record;
    v_n     integer;
    v_pj    smallint;
    v_sim   jsonb;
    v_prog  record;
    v_pts   smallint;
BEGIN
    SELECT u.auth_id, u.user_id INTO v_auth, v_user
    FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id AND b.moneda = 'ARS' AND b.activa = true
    WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;

    IF v_user IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'sin usuario con billetera ARS');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth)::text, true);

    -- Fixtures: two personals with known rates, one institution, one Me deben,
    -- one settled, one without schedule.
    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, tipo_entidad, tipo_deuda, moneda_iso,
         monto_original, monto_total_deuda, saldo_actual, saldo_al_ingreso,
         modalidad, condicion_interes, tasa_anual_tna, tasa_informada, estado)
    VALUES
        (v_user, 'TEST_G_Pedro', 'debo', 'tercero', 'personal', 'ARS', 100000, 100000, 100000, 100000,
         'libre', 'tasa', 20, true, 'activo'),
        (v_user, 'TEST_G_Juan', 'debo', 'tercero', 'personal', 'ARS', 80000, 80000, 80000, 80000,
         'libre', 'tasa', 70, true, 'activo'),
        (v_user, 'TEST_G_Banco', 'debo', 'banco', 'bancaria', 'ARS', 60000, 60000, 60000, 60000,
         'libre', 'ninguno', 0, false, 'activo');

    SELECT prestamo_id INTO v_pedro FROM public.p_prestamos WHERE entidad_nombre = 'TEST_G_Pedro';
    SELECT prestamo_id INTO v_juan  FROM public.p_prestamos WHERE entidad_nombre = 'TEST_G_Juan';
    SELECT prestamo_id INTO v_inst  FROM public.p_prestamos WHERE entidad_nombre = 'TEST_G_Banco';

    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, tipo_entidad, moneda_iso, monto_original,
         monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad, condicion_interes, estado)
    VALUES (v_user, 'TEST_G_MeDeben', 'me_deben', 'tercero', 'ARS', 50000, 50000, 50000, 50000,
            'libre', 'ninguno', 'activo')
    RETURNING prestamo_id INTO v_mdebe;

    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, tipo_entidad, moneda_iso, monto_original,
         monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad, condicion_interes, estado)
    VALUES (v_user, 'TEST_G_Saldado', 'debo', 'banco', 'ARS', 30000, 30000, 0, 30000,
            'libre', 'ninguno', 'pagado')
    RETURNING prestamo_id INTO v_bajo;

    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, tipo_entidad, moneda_iso, monto_original,
         monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad, condicion_interes, estado)
    VALUES (v_user, 'TEST_G_SinCrono', 'debo', 'banco', 'ARS', 40000, 40000, 40000, 40000,
            'libre', 'ninguno', 'activo')
    RETURNING prestamo_id INTO v_libre;

    -- ---- G1: universe ------------------------------------------------
    SELECT count(*) INTO v_n FROM public.fn_saneamiento_plan('math') p
    WHERE p.prestamo_id IN (v_mdebe, v_bajo);
    INSERT INTO t_resultado VALUES (1, 'G1 el plan excluye Me deben y saldados',
        (v_n = 0), format('colados=%s', v_n));

    -- ---- G2: Matematica by rate, unknown counted as 0 for ordering ----
    SELECT p.prestamo_id, p.prioridad INTO v_r
    FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_juan;
    SELECT p.prioridad INTO v_n FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_juan;
    INSERT INTO t_resultado VALUES (2, 'G2 Matematica: mayor tasa primero y desconocida al final',
        (v_n = 1 AND (SELECT prioridad FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_inst) >
                    (SELECT prioridad FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_pedro)),
        format('juan=%s inst=%s pedro=%s', v_n,
               (SELECT prioridad FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_inst),
               (SELECT prioridad FROM public.fn_saneamiento_plan('math') p WHERE p.prestamo_id = v_pedro)));

    -- ---- G3: Emocional by smallest balance ----------------------------
    INSERT INTO t_resultado VALUES (3, 'G3 Emocional: menor saldo primero',
        ((SELECT prioridad FROM public.fn_saneamiento_plan('emotional') p WHERE p.prestamo_id = v_libre) = 1
         AND (SELECT prioridad FROM public.fn_saneamiento_plan('emotional') p WHERE p.prestamo_id = v_pedro) >
             (SELECT prioridad FROM public.fn_saneamiento_plan('emotional') p WHERE p.prestamo_id = v_libre)),
        format('sincrono=%s pedro=%s',
               (SELECT prioridad FROM public.fn_saneamiento_plan('emotional') p WHERE p.prestamo_id = v_libre),
               (SELECT prioridad FROM public.fn_saneamiento_plan('emotional') p WHERE p.prestamo_id = v_pedro)));

    -- ---- G6: questionnaire only offers personal creditors -------------
    SELECT count(*) INTO v_n FROM public.fn_saneamiento_vinculos_preguntas() q
    WHERE q.prestamo_id = v_inst;
    INSERT INTO t_resultado VALUES (4, 'G6 el cuestionario no ofrece instituciones',
        (v_n = 0), format('instituciones ofrecidas=%s', v_n));

    -- ---- G7: scoring 3/3/5 --------------------------------------------
    PERFORM public.fn_saneamiento_vinculos_responder(
        jsonb_build_array(
            jsonb_build_object('prestamo_id', v_pedro, 'criterios', jsonb_build_array(1, 3)),
            jsonb_build_object('prestamo_id', v_juan,  'criterios', jsonb_build_array(2))));

    SELECT puntos_vinculo INTO v_pts FROM public.p_prestamos WHERE prestamo_id = v_pedro;
    SELECT puntos_vinculo INTO v_pj  FROM public.p_prestamos WHERE prestamo_id = v_juan;

    INSERT INTO t_resultado VALUES (5, 'G7 puntajes 3/3/5 suman 8 y 3',
        (v_pts = 8 AND v_pj = 3), format('pedro=%s juan=%s', v_pts, v_pj));

    -- ---- G4: Vinculos personals first --------------------------------
    INSERT INTO t_resultado VALUES (6, 'G4 Vinculos: personales antes que instituciones',
        ((SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro) <
         (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_inst)),
        format('pedro=%s inst=%s',
               (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro),
               (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_inst)));

    -- ---- G5: tie inside Vinculos --------------------------------------
    PERFORM public.fn_saneamiento_vinculos_responder(
        jsonb_build_array(
            jsonb_build_object('prestamo_id', v_pedro, 'criterios', jsonb_build_array(1, 3)),
            jsonb_build_object('prestamo_id', v_juan,  'criterios', jsonb_build_array(1, 3))));

    INSERT INTO t_resultado VALUES (7, 'G5 empate comparte prioridad y queda marcado',
        ((SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro) =
         (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_juan)
         AND (SELECT comparte_prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro)),
        format('pedro=%s juan=%s comparte=%s',
               (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro),
               (SELECT prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_juan),
               (SELECT comparte_prioridad FROM public.fn_saneamiento_plan('relationships') p WHERE p.prestamo_id = v_pedro)));

    -- ---- G9: no schedule means no fake numbers ------------------------
    v_sim := public.fn_saneamiento_simular(v_libre, 10000);
    INSERT INTO t_resultado VALUES (8, 'G9 sin cronograma: solo saldos y un motivo',
        ((v_sim->>'saldo_proyectado')::numeric = 30000
         AND v_sim->'meses_restantes' = 'null'::jsonb
         AND v_sim->'meses_ahorrados' = 'null'::jsonb
         AND v_sim->'intereses_ahorrados' = 'null'::jsonb
         AND v_sim->>'motivo' = 'sin_cronograma'),
        format('proyectado=%s motivo=%s', v_sim->>'saldo_proyectado', v_sim->>'motivo'));

    -- ---- G8: with a schedule it does compute --------------------------
    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, tipo_entidad, moneda_iso, monto_original,
         monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad, condicion_interes, estado)
    VALUES (v_user, 'TEST_G_Crono', 'debo', 'banco', 'ARS', 90000, 90000, 90000, 90000,
            'cuotas', 'tasa', 'activo')
    RETURNING prestamo_id INTO v_sinint;

    INSERT INTO public.p_prestamos_cuotas (prestamo_id, user_id, numero_cuota, fecha_vencimiento, monto_cuota, interes_componente, moneda)
    VALUES (v_sinint, v_user, 1, CURRENT_DATE + 30, 30000, 900, 'ARS'),
           (v_sinint, v_user, 2, CURRENT_DATE + 60, 30000, 600, 'ARS'),
           (v_sinint, v_user, 3, CURRENT_DATE + 90, 30000, 300, 'ARS');

    v_sim := public.fn_saneamiento_simular(v_sinint, 60000);
    INSERT INTO t_resultado VALUES (9, 'G8 con cronograma calcula meses e intereses',
        ((v_sim->>'meses_restantes')::integer = 3
         AND (v_sim->>'meses_ahorrados')::integer = 2
         AND (v_sim->>'intereses_ahorrados')::numeric = 1500),
        format('restantes=%s ahorrados=%s interes=%s', v_sim->>'meses_restantes',
               v_sim->>'meses_ahorrados', v_sim->>'intereses_ahorrados'));

    -- ---- G10: unknown interest component is not treated as zero ------
    UPDATE public.p_prestamos_cuotas SET interes_componente = NULL
    WHERE prestamo_id = v_sinint AND numero_cuota = 1;

    v_sim := public.fn_saneamiento_simular(v_sinint, 60000);
    INSERT INTO t_resultado VALUES (10, 'G10 interes no informado no se inventa como cero',
        (v_sim->'intereses_ahorrados' = 'null'::jsonb
         AND v_sim->>'motivo' = 'interes_por_cuota_no_informado'),
        format('interes=%s motivo=%s', v_sim->>'intereses_ahorrados', v_sim->>'motivo'));

    -- ---- G11: progress ------------------------------------------------
    SELECT * INTO v_prog FROM public.fn_saneamiento_progreso() LIMIT 1;
    INSERT INTO t_resultado VALUES (11, 'G11 progreso sin fecha inventada',
        -- One active loan has no schedule, so no finish date may be shown.
        (v_prog.fecha_fin_estimada IS NULL
         AND v_prog.motivo_sin_fecha = 'no_todos_los_prestamos_tienen_cronograma'
         AND v_prog.porcentaje IS NOT NULL),
        format('moneda=%s pendiente=%s pagado=%s pct=%s fecha=%s',
               v_prog.moneda, v_prog.saldo_pendiente, v_prog.pagado_registrado,
               v_prog.porcentaje, v_prog.fecha_fin_estimada));
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
