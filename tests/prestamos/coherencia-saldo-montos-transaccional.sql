-- Decisiones 32A y 33A: saldo derivado y coherencia entre billetera y aplicado.
--
-- Todo corre entre BEGIN ... ROLLBACK con un usuario descartable, asi que no queda nada.
--
-- Prueba:
--   A1  prestamo saldado + edicion directa del saldo -> error_saldo_derivado
--   A2  prestamo saldado + cambio de nombre          -> se aplica
--   A3  edicion que no cambia nada                   -> error_no_changes
--   A4  misma moneda, billetera 30.000 / aplicado 40.000 -> error_monto_incoherente,
--       sin filas nuevas en p_caja ni en p_prestamos_pagos
--   A5  misma moneda coherente                       -> escribe una sola vez
--   A6  sobrepago confirmado 100.000 contra 60.000   -> aplicado 60.000 + excedente 40.000,
--       un solo egreso, saldo 0, estado pagado
--   A7  monedas distintas con importes independientes -> se acepta
--   A8  correccion misma moneda incoherente          -> se rechaza y la caja no cambia
--   A9  correccion que deja saldo pendiente           -> vuelve a activo

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden     integer,
    assertion text,
    ok        boolean,
    detalle   text
) ON COMMIT DROP;

DO $suite$
DECLARE
    v_user   bigint;
    v_auth   uuid;
    v_wallet bigint;
    v_wallet_usd bigint;
    v_modo   text;

    v_p1     bigint;
    v_p2     bigint;
    v_p3     bigint;
    v_p4     bigint;
    v_p5     bigint;
    v_caja1  bigint;
    v_pago   bigint;

    v_msg    text;
    v_n      integer;
    v_saldo  numeric;
    v_pagado numeric;
    v_estado text;
    v_apl    numeric;
    v_exc    numeric;
BEGIN
    -- ---------------------------------------------------------------- fixture
    SELECT modo_app INTO v_modo FROM public.usuarios WHERE modo_app IS NOT NULL LIMIT 1;

    INSERT INTO public.usuarios (nombre, login, password, modo_app, auth_id, creado_at)
    VALUES ('QA coherencia', 'qa_coh_' || substr(md5(random()::text), 1, 8), 'x',
            COALESCE(v_modo, 'personal'), gen_random_uuid(), now() - interval '30 days')
    RETURNING user_id, auth_id INTO v_user, v_auth;

    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)
    VALUES (v_user, 'QA ARS', 'ARS', 1000000, true) RETURNING billetera_id INTO v_wallet;

    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)
    VALUES (v_user, 'QA USD', 'USD', 1000, true) RETURNING billetera_id INTO v_wallet_usd;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_auth::text, 'role', 'service_role')::text, true);

    -- Prestamo saldado: 100.000 en tres cuotas, pagado entero.
    v_p1 := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'QA acreedor', p_moneda => 'ARS',
        p_monto_original => 100000, p_modalidad => 'cuotas', p_es_historico => false,
        p_nombre => 'QA saldado', p_tipo_deuda => 'personal',
        p_condicion_interes => 'ninguno', p_billetera_id => v_wallet,
        p_monto_billetera => 100000, p_moneda_billetera => 'ARS', p_fecha => '2026-11-01',
        p_cuotas => '[{"fecha_vencimiento":"2026-12-01","monto_cuota":50000},
                      {"fecha_vencimiento":"2027-01-01","monto_cuota":50000}]'::jsonb);

    v_pago := public.fn_prestamo_registrar_pago(
        p_prestamo_id => v_p1, p_billetera_id => v_wallet, p_monto_billetera => 100000,
        p_moneda_billetera => 'ARS', p_monto_aplicado => 100000, p_fecha => '2026-11-02');

    SELECT saldo_actual, monto_pagado_acumulado, estado
      INTO v_saldo, v_pagado, v_estado
      FROM public.p_prestamos WHERE prestamo_id = v_p1;

    INSERT INTO t_resultado VALUES (0, 'fixture: prestamo saldado', v_saldo = 0 AND v_estado = 'pagado',
        format('saldo=%s pagado=%s estado=%s', v_saldo, v_pagado, v_estado));

    -- ---- A1 -------------------------------------------------------------
    BEGIN
        PERFORM public.fn_prestamo_editar(p_prestamo_id => v_p1, p_saldo_al_ingreso => 50000);
        INSERT INTO t_resultado VALUES (1, 'saldado + saldo editado se rechaza', false, 'no levanto');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (1, 'saldado + saldo editado se rechaza',
            SQLERRM = 'error_saldo_derivado', SQLERRM);
    END;

    SELECT saldo_actual INTO v_saldo FROM public.p_prestamos WHERE prestamo_id = v_p1;
    INSERT INTO t_resultado VALUES (2, 'el saldo no se movio', v_saldo = 0, 'saldo=' || v_saldo);

    -- ---- A2 -------------------------------------------------------------
    BEGIN
        PERFORM public.fn_prestamo_editar(p_prestamo_id => v_p1, p_nombre => 'QA saldado renombrado');
        SELECT nombre_prestamo INTO v_msg FROM public.p_prestamos WHERE prestamo_id = v_p1;
        INSERT INTO t_resultado VALUES (3, 'condiciones de un saldado se editan', v_msg = 'QA saldado renombrado', v_msg);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (3, 'condiciones de un saldado se editan', false, SQLERRM);
    END;

    -- ---- A3 -------------------------------------------------------------
    BEGIN
        PERFORM public.fn_prestamo_editar(p_prestamo_id => v_p1, p_nombre => 'QA saldado renombrado');
        INSERT INTO t_resultado VALUES (4, 'edicion sin cambios se rechaza', false, 'no levanto');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (4, 'edicion sin cambios se rechaza',
            SQLERRM = 'error_no_changes', SQLERRM);
    END;

    -- ---------------------------------------------------------------------
    -- Prestamo vivo de 50.000 para las pruebas de coherencia.
    v_p2 := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'QA acreedor', p_moneda => 'ARS',
        p_monto_original => 50000, p_modalidad => 'libre', p_es_historico => false,
        p_nombre => 'QA coherencia', p_tipo_deuda => 'personal',
        p_condicion_interes => 'ninguno', p_billetera_id => v_wallet,
        p_monto_billetera => 50000, p_moneda_billetera => 'ARS', p_fecha => '2026-11-01');

    SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;
    v_caja1 := v_n;

    -- ---- A4 -------------------------------------------------------------
    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id => v_p2, p_billetera_id => v_wallet, p_monto_billetera => 30000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 40000, p_fecha => '2026-11-02');
        INSERT INTO t_resultado VALUES (5, 'misma moneda incoherente se rechaza', false, 'no levanto');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (5, 'misma moneda incoherente se rechaza',
            SQLERRM = 'error_monto_incoherente', SQLERRM);
    END;

    SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;
    INSERT INTO t_resultado VALUES (6, 'no se escribio ninguna caja',
        v_n = v_caja1, format('antes=%s despues=%s', v_caja1, v_n));

    SELECT count(*) INTO v_n FROM public.p_prestamos_pagos WHERE prestamo_id = v_p2;
    INSERT INTO t_resultado VALUES (7, 'no se escribio ningun pago', v_n = 0, 'pagos=' || v_n);

    -- ---- A5 -------------------------------------------------------------
    v_p5 := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'QA acreedor', p_moneda => 'ARS',
        p_monto_original => 50000, p_modalidad => 'libre', p_es_historico => false,
        p_nombre => 'QA coherente', p_tipo_deuda => 'personal',
        p_condicion_interes => 'ninguno', p_billetera_id => v_wallet,
        p_monto_billetera => 50000, p_moneda_billetera => 'ARS', p_fecha => '2026-11-01');

    BEGIN
        v_pago := public.fn_prestamo_registrar_pago(
            p_prestamo_id => v_p5, p_billetera_id => v_wallet, p_monto_billetera => 30000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 30000, p_fecha => '2026-11-02');
        SELECT saldo_actual INTO v_saldo FROM public.p_prestamos WHERE prestamo_id = v_p5;
        INSERT INTO t_resultado VALUES (8, 'misma moneda coherente escribe', v_saldo = 20000,
            format('saldo=%s pago=%s', v_saldo, v_pago));
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (8, 'misma moneda coherente escribe', false, SQLERRM);
        v_pago := NULL;
    END;

    -- ---- A6 -------------------------------------------------------------
    v_p3 := public.fn_prestamo_crear(
        p_direccion => 'me_deben', p_contraparte => 'QA deudor', p_moneda => 'ARS',
        p_monto_original => 60000, p_modalidad => 'libre', p_es_historico => false,
        p_nombre => 'QA sobrepago', p_tipo_deuda => 'personal',
        p_condicion_interes => 'ninguno', p_billetera_id => v_wallet,
        p_monto_billetera => 60000, p_moneda_billetera => 'ARS', p_fecha => '2026-11-01');

    SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;
    v_caja1 := v_n;

    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id => v_p3, p_billetera_id => v_wallet, p_monto_billetera => 100000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 100000, p_fecha => '2026-11-02',
            p_confirmar_excedente => true);

        SELECT saldo_actual, monto_pagado_acumulado, estado, saldo_al_ingreso
          INTO v_saldo, v_pagado, v_estado, v_apl
          FROM public.p_prestamos WHERE prestamo_id = v_p3;

        SELECT monto_aplicado, interes_excedente INTO v_apl, v_exc
          FROM public.p_prestamos_pagos WHERE prestamo_id = v_p3 ORDER BY pago_id DESC LIMIT 1;

        SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;

        INSERT INTO t_resultado VALUES (9, 'sobrepago confirmado: 60 aplicado + 40 excedente',
            v_apl = 60000 AND v_exc = 40000 AND v_saldo = 0 AND v_estado = 'pagado' AND v_n = v_caja1 + 1,
            format('aplicado=%s excedente=%s saldo=%s estado=%s cajas=%s', v_apl, v_exc, v_saldo, v_estado, v_n));
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (9, 'sobrepago confirmado: 60 aplicado + 40 excedente', false, SQLERRM);
    END;

    -- ---- A7 -------------------------------------------------------------
    v_p4 := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'QA banco', p_moneda => 'USD',
        p_monto_original => 100, p_modalidad => 'vencimiento_unico', p_es_historico => false,
        p_nombre => 'QA multimoneda', p_tipo_deuda => 'institucional',
        p_condicion_interes => 'ninguno', p_proximo_vencimiento => '2027-01-15',
        p_billetera_id => v_wallet_usd, p_monto_billetera => 100,
        p_moneda_billetera => 'USD', p_fecha => '2026-11-01');

    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id => v_p4, p_billetera_id => v_wallet, p_monto_billetera => 5000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 30, p_fecha => '2026-11-02');

        SELECT saldo_actual INTO v_saldo FROM public.p_prestamos WHERE prestamo_id = v_p4;
        INSERT INTO t_resultado VALUES (10, 'monedas distintas: dos importes independientes',
            v_saldo = 70, format('saldo USD=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (10, 'monedas distintas: dos importes independientes', false, SQLERRM);
    END;

    -- ---- A8 -------------------------------------------------------------
    SELECT p.pago_id INTO v_pago
      FROM public.p_prestamos_pagos p WHERE p.prestamo_id = v_p3 AND p.estado = 'activo'
      ORDER BY p.pago_id DESC LIMIT 1;

    SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;
    v_caja1 := v_n;

    BEGIN
        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id => v_pago, p_billetera_id => v_wallet, p_monto_billetera => 30000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 20000, p_fecha => '2026-11-02');
        INSERT INTO t_resultado VALUES (11, 'correccion incoherente se rechaza', false, 'no levanto');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (11, 'correccion incoherente se rechaza',
            SQLERRM = 'error_monto_incoherente', SQLERRM);
    END;

    SELECT count(*) INTO v_n FROM public.p_caja WHERE user_id = v_user;
    INSERT INTO t_resultado VALUES (12, 'la correccion rechazada no toca la caja',
        v_n = v_caja1, format('antes=%s despues=%s', v_caja1, v_n));

    -- ---- A9 -------------------------------------------------------------
    BEGIN
        -- Baja el pago del prestamo saldado: tiene que volver a activo con saldo.
        SELECT p.pago_id INTO v_pago
          FROM public.p_prestamos_pagos p WHERE p.prestamo_id = v_p1 AND p.estado = 'activo'
          ORDER BY p.pago_id LIMIT 1;

        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id => v_pago, p_billetera_id => v_wallet, p_monto_billetera => 60000,
            p_moneda_billetera => 'ARS', p_monto_aplicado => 60000, p_fecha => '2026-11-02');

        SELECT saldo_actual, estado INTO v_saldo, v_estado
          FROM public.p_prestamos WHERE prestamo_id = v_p1;

        INSERT INTO t_resultado VALUES (13, 'corregir un pago deja el prestamo activo',
            v_saldo = 40000 AND v_estado = 'activo', format('saldo=%s estado=%s', v_saldo, v_estado));
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (13, 'corregir un pago deja el prestamo activo', false, SQLERRM);
    END;
END
$suite$;

SELECT orden,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       assertion,
       detalle
  FROM t_resultado
 ORDER BY orden;

ROLLBACK;
