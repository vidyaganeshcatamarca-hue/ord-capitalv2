-- Walkthrough fixture for user 1: three loans that exercise the calendar and the
-- currency display. All of them are historical, so fn_prestamo_crear creates no cash
-- movement and no wallet changes: the only rows added are the loans themselves.
--
-- Names are prefixed ZZ PRUEBA so they are trivially identifiable and removable.

DO $$
DECLARE
    v_auth uuid;
    v_uid  bigint := 1;
    v_id   bigint;
BEGIN
    SELECT auth_id INTO v_auth FROM public.usuarios WHERE user_id = v_uid;
    IF v_auth IS NULL THEN
        RAISE EXCEPTION 'fixture: user % sin auth_id', v_uid;
    END IF;
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_auth, 'role', 'service_role')::text, true);

    -- 1. Single due date. Must appear in the calendar on its agreed date.
    v_id := public.fn_prestamo_crear(
        p_direccion => 'debo',
        p_contraparte => 'Fixture único',
        p_moneda => 'ARS',
        p_monto_original => 120000,
        p_modalidad => 'vencimiento_unico',
        p_es_historico => true,
        p_nombre => 'ZZ PRUEBA unico',
        p_tipo_deuda => 'personal',
        p_saldo_al_ingreso => 120000,
        p_condicion_interes => 'ninguno',
        p_tasa_anual => 0,
        p_tasa_informada => true,
        p_interes_total_acordado => 0,
        p_proximo_vencimiento => current_date + 10,
        p_billetera_id => NULL,
        p_monto_billetera => NULL,
        p_moneda_billetera => NULL,
        p_fecha => current_date - 20,
        p_nota => 'fixture walkthrough',
        p_cuotas => NULL
    );
    RAISE NOTICE 'unico id=%', v_id;

    -- 2. Free loan. Must never produce a calendar event: there is no agreed date.
    v_id := public.fn_prestamo_crear(
        p_direccion => 'debo',
        p_contraparte => 'Fixture libre',
        p_moneda => 'ARS',
        p_monto_original => 80000,
        p_modalidad => 'libre',
        p_es_historico => true,
        p_nombre => 'ZZ PRUEBA libre',
        p_tipo_deuda => 'personal',
        p_saldo_al_ingreso => 80000,
        p_condicion_interes => 'ninguno',
        p_tasa_anual => 0,
        p_tasa_informada => true,
        p_interes_total_acordado => 0,
        p_proximo_vencimiento => NULL,
        p_billetera_id => NULL,
        p_moneda_billetera => NULL,
        p_fecha => current_date - 15,
        p_nota => 'fixture walkthrough',
        p_cuotas => NULL
    );
    RAISE NOTICE 'libre id=%', v_id;

    -- 3. Three installments in dollars. Exercises the schedule and the currency column.
    v_id := public.fn_prestamo_crear(
        p_direccion => 'me_deben',
        p_contraparte => 'Fixture dólares',
        p_moneda => 'USD',
        p_monto_original => 3000,
        p_modalidad => 'cuotas',
        p_es_historico => true,
        p_nombre => 'ZZ PRUEBA usd',
        p_tipo_deuda => 'personal',
        p_saldo_al_ingreso => 3000,
        p_condicion_interes => 'ninguno',
        p_tasa_anual => 0,
        p_tasa_informada => true,
        p_interes_total_acordado => 0,
        p_proximo_vencimiento => NULL,
        p_billetera_id => NULL,
        p_moneda_billetera => NULL,
        p_fecha => current_date - 10,
        p_nota => 'fixture walkthrough',
        p_cuotas => jsonb_build_array(
            jsonb_build_object('numero_cuota', 1, 'fecha_vencimiento', (current_date + 5)::text,  'monto_cuota', 1000, 'interes_componente', 0),
            jsonb_build_object('numero_cuota', 2, 'fecha_vencimiento', (current_date + 35)::text, 'monto_cuota', 1000, 'interes_componente', 0),
            jsonb_build_object('numero_cuota', 3, 'fecha_vencimiento', (current_date + 65)::text, 'monto_cuota', 1000, 'interes_componente', 0)
        )
    );
    RAISE NOTICE 'usd id=%', v_id;
END $$;

SELECT prestamo_id, nombre_prestamo, entidad_nombre, modalidad, moneda_iso, monto_original, proximo_vencimiento, tipo_flujo
FROM public.p_prestamos WHERE nombre_prestamo LIKE 'ZZ PRUEBA%' ORDER BY prestamo_id;
