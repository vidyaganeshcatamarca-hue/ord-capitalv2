-- Bloque B · el caso de aceptacion del duenio, con numeros, y la conciliacion.
--
-- Se arma el escenario desde cero dentro de la transaccion (billeteras, cuotas, gastos y
-- presupuestos), se corre la operacion real y se miden los cinco numeros del caso. Todo
-- se revierte: no se toca ningun dato del duenio.
--
--   A · 60.000 de liquidez, arrastre -20.000, asignacion manual +30.000
--       -> el sobre queda en +10.000 y el saldo libre en 50.000
--   B · la conciliacion cierra con esos mismos numeros, sin grupos descuadrados ni repetidos
--   C · asignar no crea dinero: la liquidez no se mueve
--   D · el deficit no se cubre solo: sin la asignacion manual, el saldo libre no cambia
--   E · libertad conserva su naturaleza: la conciliacion avisa que es planificacion
DO $t$
DECLARE
    v_uid bigint; v_jwt text; v_hogar bigint; v_moneda text;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_prev date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
    v_dia int2; v_f_inicio date; v_f_fin date;
    v_libre_antes numeric; v_libre_despues numeric;
    v_bolsa_antes numeric; v_bolsa_despues numeric; v_gasto numeric;
    v_conc jsonb;
    v_uid_lib bigint; v_jwt_lib text;
    v_conc_lib jsonb;
    r jsonb := '[]'::jsonb;
BEGIN
    SELECT user_id, auth_id::text INTO v_uid, v_jwt
      FROM public.usuarios WHERE user_id = 1 AND auth_id IS NOT NULL;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'la cuenta de prueba 1 no existe o no tiene auth_id'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt, 'role', 'authenticated')::text, true);

    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'base_cero', dia_ancla_ciclo = 1 WHERE user_id = v_uid;
    SELECT dia_ancla_ciclo INTO v_dia FROM public.p_presupuestos_config WHERE user_id = v_uid;
    v_moneda := public.fn_get_default_currency(v_uid);
    v_f_inicio := date_trunc('month', v_ciclo)::date;
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- sin cuotas pendientes que descuenten
    UPDATE public.p_cuotas_detalle SET pagado = true
     WHERE user_id = v_uid AND pagado = false AND fecha_estimada_pago <= v_f_fin;

    -- 2 · el ciclo arranca sin nada asignado
    DELETE FROM public.p_presupuestos WHERE user_id = v_uid AND mes_periodo = v_ciclo;

    -- 3 · el arrastre de Alimentos-Hogar (rubro 2) queda en -20.000. Con techo previo 0
    --     la funcion fuerza arrastre 0, asi que el mes anterior tiene 100.000 asignados
    --     y 120.000 gastados: 100.000 - 120.000 = -20.000. El ciclo actual queda sin gasto.
    DELETE FROM public.p_presupuestos WHERE user_id = v_uid AND mes_periodo = v_prev
       AND estructura_egreso_id IN (SELECT 2 UNION SELECT e.estructura_id FROM public.p_estructuras_egresos e WHERE e.padre_id = 2);
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (v_uid, 2, v_prev, 100000, 1);

    DELETE FROM public.p_caja c
     WHERE c.user_id = v_uid AND c.tipo = 'expense'
       AND c.estructura_egreso_id IN (SELECT 2 UNION SELECT e.estructura_id FROM public.p_estructuras_egresos e WHERE e.padre_id = 2);
    INSERT INTO public.p_caja (fecha, tipo, estructura_egreso_id, user_id, valor_egreso, es_compartido)
    VALUES (v_prev + 5, 'expense', 2, v_uid, 120000, false);

    -- 1 · liquidez exacta de 60.000, AL FINAL. Va despues de todas las operaciones sobre
    --     p_caja porque borrar o insertar un movimiento devuelve o quita plata de las
    --     billeteras (hay disparadores que mantienen el saldo): armar la liquidez antes
    --     seria pelear con el libro mayor y el numero no se sostendria.
    UPDATE public.p_billeteras SET saldo_actual = 0
     WHERE user_id = v_uid AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda;
    UPDATE public.p_billeteras SET saldo_actual = 60000
     WHERE ctid = (SELECT ctid FROM public.p_billeteras
                    WHERE user_id = v_uid AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda
                    LIMIT 1);

    v_libre_antes := public.fn_obtener_saldo_a_asignar(v_ciclo);
    SELECT monto_disponible INTO v_bolsa_antes FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE estructura_id = 2;

    r := r || jsonb_build_object('caso', 'D el deficit no se cubre solo', 'ok',
        (v_libre_antes = 60000 AND v_bolsa_antes = -20000),
        'libre_antes', v_libre_antes, 'bolsa_antes', v_bolsa_antes,
        'billeteras', (SELECT count(*) FROM public.p_billeteras WHERE user_id = v_uid AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda),
        'saldo_billeteras', (SELECT COALESCE(SUM(saldo_actual),0) FROM public.p_billeteras WHERE user_id = v_uid AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda),
        'moneda', v_moneda);

    -- 4 · la asignacion manual, por la operacion real
    PERFORM public.fn_asignar_presupuesto(2, 30000, v_ciclo, 'prueba_bloque_b', false);

    SELECT monto_disponible, monto_gastado INTO v_bolsa_despues, v_gasto
      FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE estructura_id = 2;
    v_libre_despues := public.fn_obtener_saldo_a_asignar(v_ciclo);

    r := r || jsonb_build_object('caso', 'A el caso de aceptacion', 'ok',
        (v_bolsa_despues = 10000 AND v_libre_despues = 50000),
        'bolsa_despues', v_bolsa_despues, 'libre_despues', v_libre_despues,
        'esperado_bolsa', 10000, 'esperado_libre', 50000);

    -- 5 · la conciliacion tiene que cerrar con esos numeros
    v_conc := public.fn_conciliar_presupuesto(v_ciclo);
    r := r || jsonb_build_object('caso', 'B la conciliacion cierra', 'ok',
        ((v_conc ->> 'cierra')::boolean
         AND (v_conc ->> 'liquidez')::numeric = 60000
         AND (v_conc ->> 'reservas_positivas')::numeric = 10000
         AND jsonb_array_length(v_conc -> 'grupos_con_gasto_descuadrado') = 0
         AND jsonb_array_length(v_conc -> 'grupos_repetidos_en_totales') = 0),
        'conciliacion', v_conc);

    -- 6 · asignar no crea dinero: la liquidez no se movio
    r := r || jsonb_build_object('caso', 'C asignar no crea dinero', 'ok',
        ((v_conc ->> 'liquidez')::numeric = 60000),
        'liquidez', (v_conc ->> 'liquidez')::numeric);

    -- 7 · libertad: el mismo motor, pero sus presupuestos son planificacion
    SELECT user_id, auth_id::text INTO v_uid_lib, v_jwt_lib
      FROM public.usuarios WHERE user_id = 198 AND auth_id IS NOT NULL;
    IF v_uid_lib IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt_lib, 'role', 'authenticated')::text, true);
        v_conc_lib := public.fn_conciliar_presupuesto(NULL);
        r := r || jsonb_build_object('caso', 'E libertad se declara planificacion', 'ok',
            ((v_conc_lib ->> 'libertad_es_planificacion')::boolean
             AND (v_conc_lib ->> 'cierra')::boolean),
            'modo', v_conc_lib ->> 'modo', 'cierra', v_conc_lib ->> 'cierra',
            'libre', v_conc_lib ->> 'libre_reportado');
    ELSE
        r := r || jsonb_build_object('caso', 'E libertad se declara planificacion', 'ok', false,
            'error', 'la cuenta 198 no existe o no tiene auth_id');
    END IF;

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
