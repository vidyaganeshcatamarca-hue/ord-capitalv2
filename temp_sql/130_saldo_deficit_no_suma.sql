-- 130 — Los déficits no suman al "disponible para asignar"
--
-- Tanda 1 de la corrección de base cero (odd/tasks/base-cero-logica.md, S1).
--
-- QUÉ ESTABA MAL
-- El disponible se calculaba restando la suma COMPLETA de los saldos de sobres:
--
--     liquidez - SUM(monto_disponible) - cuotas_de_tarjeta
--
-- Un sobre en rojo tiene monto_disponible negativo, así que restarlo SUMA. Con
-- los datos del user 1 (ciclo del 1/10, base cero desde el 27/10):
--
--     liquidez real ......................... 2.627.275
--     SUM(monto_disponible) de los sobres ... -5.130.007  (incluye arrastres)
--     cuotas de tarjeta .....................          0
--     "disponible para asignar" ............. 7.358.752   <-- plata inexistente
--
-- El propio comentario de la versión anterior lo admitía ("si el sobre está en
-- rojo, al sumarlo aquí infla el disponible temporalmente, obligando al usuario
-- a castigarse bajándolo manualmente al cubrir el déficit"). En un modo que
-- promete que no se puede presupuestar dinero que no hay, eso es un defecto, no
-- una función: el guard de fn_asignar_presupuesto usa este mismo número, así que
-- dejaba asignar 7,3M contra 2,6M de liquidez.
--
-- QUÉ HACE AHORA
-- Resta solo los saldos POSITIVOS: GREATEST(monto_disponible, 0). La lógica es
-- contable, no estética:
--   - Sobre con saldo positivo: esa plata está en la billetera pero ya tiene
--     dueño (el sobre) → no está libre, se resta.
--   - Sobre en rojo (sobregasto): el gasto ya salió de la billetera, así que el
--     saldo de billeteras ya lo descontó. No hay nada que restar; el rojo se
--     muestra como alerta, no como dinero.
--
-- ALCANCE
-- No toca ninguna tabla ni ningún dato: reemplaza una función. El número cambia
-- también en modo anticipado (la pantalla lo muestra con la etiqueta
-- "PROYECCIÓN DEL MES", que ya era otra deuda: usa esta misma función), y ahí el
-- criterio correcto es el mismo.
--
-- ANTES (user 1): 7.358.752 contra 2.627.275 de liquidez.
-- DESPUÉS: liquidez - suma de sobres positivos - cuotas.

CREATE OR REPLACE FUNCTION public.fn_obtener_saldo_a_asignar(p_mes_periodo date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_f_inicio date;
    v_f_fin date;
    v_dia_ancla int2;
    v_moneda_local text;
    v_total_ingresos numeric := 0;
    v_total_asignado numeric := 0;
    v_total_tarjetas numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Sin pais confirmado no hay moneda principal contra la cual comparar: 0 explicito.
    v_moneda_local := public.fn_get_default_currency(v_user_id);
    IF v_moneda_local IS NULL THEN
        RETURN 0;
    END IF;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Liquidez Total (solo billeteras normales activas de la MONEDA PRINCIPAL)
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_total_ingresos
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda_local;

    -- 2. Dinero ya comprometido en sobres: SOLO los saldos positivos.
    -- Ronda 7 (S1): antes se sumaba monto_disponible completo, y como un sobre en
    -- rojo es negativo, restarlo SUMABA liquidez inexistente (7.358.752 sobre
    -- 2.627.275 reales para el user 1). El sobregasto no se resta porque el gasto
    -- ya salio de la billetera: se muestra como alerta, no como plata disponible.
    SELECT COALESCE(SUM(GREATEST(monto_disponible, 0)), 0) INTO v_total_asignado
    FROM public.fn_reporte_sobres_detalle(p_mes_periodo);

    -- 3. Tarjetas impagas hasta el fin del ciclo actual
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_total_tarjetas
    FROM p_cuotas_detalle
    WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago <= v_f_fin;

    RETURN v_total_ingresos - v_total_asignado - v_total_tarjetas;
END;
$function$;
