-- Etapa 2: una sola bolsa en el padre.
--
-- Corre en una transacción que termina en RAISE EXCEPTION: no deja una fila.
-- Comprueba que el número del reporte, el de la lista de orígenes y el del validador de
-- transferencias son el mismo, que el arrastre viaja con su signo, que una subcategoría no
-- tiene plata propia ni aparece como origen, y que en los totales cuenta una sola fila por
-- grupo (sin contar dos veces padre e hijos).
DO $t$
DECLARE
    v_jwt text; v_uid bigint; r jsonb := '[]'::jsonb;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_padre bigint; v_bolsa numeric; v_rep record; v_plata numeric;
    v_origenes int; v_origenes_hijos int; v_origenes_no_positivos int;
    v_hijo record; v_hijo_ok boolean;
    v_cuentan int; v_cuentan_hijas int; v_grupos_con_dos int;
BEGIN
    SELECT user_id, auth_id::text INTO v_uid, v_jwt FROM public.usuarios WHERE user_id = {{USUARIO}} AND auth_id IS NOT NULL;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'no hay usuario para probar'; END IF;
        -- Cuenta de prueba designada (no se elige sola) y modo forzado dentro de la
    -- transaccion: las dos cuentas designadas son de libertad y esta prueba necesita
    -- base cero. Todo esto se revierte al final.
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'base_cero' WHERE user_id = v_uid;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt, 'role','authenticated')::text, true);

    SELECT e.estructura_id INTO v_padre
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid
       AND EXISTS (SELECT 1 FROM public.p_estructuras_egresos h WHERE h.padre_id = e.estructura_id)
     ORDER BY e.estructura_id LIMIT 1;
    IF v_padre IS NULL THEN RAISE EXCEPTION 'el usuario de prueba no tiene rubros padre'; END IF;

    v_bolsa := public.fn_disponible_transferible(v_padre, v_ciclo);
    SELECT * INTO v_rep FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE estructura_id = v_padre;
    SELECT COALESCE(p.monto_limite, 0) INTO v_plata FROM public.p_presupuestos p
     WHERE p.estructura_egreso_id = v_padre AND p.mes_periodo = v_ciclo AND p.user_id = v_uid;

    -- A · reporte, lista y validador dicen lo mismo
    r := r || jsonb_build_object('caso', 'A una sola bolsa', 'ok',
        (v_rep.monto_disponible = v_bolsa
         AND v_rep.monto_asignado = v_rep.monto_disponible + v_rep.monto_gastado),
        'padre', v_padre, 'validador', v_bolsa, 'reporte', v_rep.monto_disponible,
        'asignado', v_rep.monto_asignado, 'gastado', v_rep.monto_gastado, 'plata', v_plata);

    -- B · el arrastre viaja con su signo y está dentro de lo asignado
    r := r || jsonb_build_object('caso', 'B arrastre con signo', 'ok',
        (v_rep.arrastre_mes_anterior = v_rep.monto_asignado - v_plata),
        'arrastre', v_rep.arrastre_mes_anterior, 'asignado_menos_plata', v_rep.monto_asignado - v_plata);

    -- C · la lista de orígenes: solo padres o sueltos, y solo con saldo
    SELECT count(*),
           count(*) FILTER (WHERE e.padre_id IS NOT NULL),
           count(*) FILTER (WHERE d.disponible <= 0)
      INTO v_origenes, v_origenes_hijos, v_origenes_no_positivos
      FROM public.fn_disponibles_transferibles(v_ciclo) d
      JOIN public.p_estructuras_egresos e ON e.estructura_id = d.estructura_id;
    r := r || jsonb_build_object('caso', 'C lista de origenes', 'ok',
        (v_origenes_hijos = 0 AND v_origenes_no_positivos = 0),
        'origenes', v_origenes, 'hijas', v_origenes_hijos, 'sin_saldo', v_origenes_no_positivos);

    -- D · una subcategoría no tiene plata ni arrastre propios
    SELECT * INTO v_hijo FROM public.fn_reporte_sobres_detalle(v_ciclo)
     WHERE padre_id = v_padre ORDER BY estructura_id LIMIT 1;
    v_hijo_ok := (v_hijo.arrastre_mes_anterior = 0
                  AND v_hijo.monto_asignado = COALESCE((SELECT p.monto_limite FROM public.p_presupuestos p
                        WHERE p.estructura_egreso_id = v_hijo.estructura_id
                          AND p.mes_periodo = v_ciclo AND p.user_id = v_uid), 0));
    r := r || jsonb_build_object('caso', 'D subcategoria sin bolsa', 'ok', v_hijo_ok,
        'hijo', v_hijo.estructura_id, 'asignado', v_hijo.monto_asignado,
        'arrastre', v_hijo.arrastre_mes_anterior, 'gastado', v_hijo.monto_gastado);

    -- E · en los totales cuenta una fila por grupo: nunca el padre y además sus hijos
    SELECT count(*), count(*) FILTER (WHERE padre_id IS NOT NULL)
      INTO v_cuentan, v_cuentan_hijas
      FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE cuenta_en_totales;
    SELECT count(*) INTO v_grupos_con_dos
      FROM (SELECT COALESCE(padre_id, estructura_id) AS grupo
              FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE cuenta_en_totales
             GROUP BY 1 HAVING count(*) > 1) x;
    r := r || jsonb_build_object('caso', 'E una fila por grupo', 'ok',
        (v_cuentan_hijas = 0 AND v_grupos_con_dos = 0),
        'filas_que_cuentan', v_cuentan, 'de_esas_hijas', v_cuentan_hijas, 'grupos_con_dos', v_grupos_con_dos);

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
