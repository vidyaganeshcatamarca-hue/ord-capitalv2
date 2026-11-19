-- T17: make fn_clonar_usuario_admin clone the loans module completely.
--
-- Two gaps, and the first one is a silent corruption:
--
-- 1. The p_prestamos copy lists columns explicitly and predates the rebuild, so
--    saldo_al_ingreso, modalidad, condicion_interes, interes_total_acordado,
--    tasa_informada, puntos_vinculo and eliminado_at were NOT copied. A cloned loan
--    would land with saldo_al_ingreso = 0, which is the base of every balance
--    calculation: the loan would read as "nothing pending" and the payments would
--    have nowhere to apply.
--
-- 2. No schedule, no operations and no Vinculos answers were copied at all.
--
-- The clone's own mapping technique is reused rather than invented: it deletes the
-- destination's data first, copies in id order, and then pairs
-- row_number() OVER (ORDER BY id) on both sides. That is why the p_prestamos copy
-- gains an explicit ORDER BY: without it the pairing can cross and each cloned
-- schedule would attach to another loan.
--
-- Dependencies: the new rows need p_prestamos remapped (own map), p_caja remapped
-- (_map_caja) and p_billeteras remapped (_map_billeteras). p_prestamos is copied
-- after p_caja, so _map_caja is already populated.

BEGIN;

DO $fix$
DECLARE
    v_oid    oid;
    v_def    text;
    v_anchor text;
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_clonar_usuario_admin';

    v_def := pg_get_functiondef(v_oid);

    IF position('_map_prestamo' IN v_def) > 0 THEN
        RAISE NOTICE 'ya estaba extendido';
        RETURN;
    END IF;

    -- 1. A map for p_prestamos, next to the existing ones.
    v_anchor := $a1$    CREATE TEMP TABLE _map_inversiones (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;$a1$;
    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro la declaracion de _map_inversiones';
    END IF;
    v_def := replace(v_def, v_anchor, $b1$    CREATE TEMP TABLE _map_inversiones (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _map_prestamo   (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;$b1$);

    -- 2. Copy the columns the rebuild added.
    v_anchor := $a2$proximo_vencimiento, monto_original)
    SELECT v_user_id_destino$a2$;
    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro la lista de columnas de p_prestamos';
    END IF;
    v_def := replace(v_def, v_anchor, $b2$proximo_vencimiento, monto_original,
        saldo_al_ingreso, modalidad, condicion_interes, interes_total_acordado,
        tasa_informada, puntos_vinculo, eliminado_at)
    SELECT v_user_id_destino$b2$);

    v_anchor := $a3$p.cuota_mensual, p.proximo_vencimiento, p.monto_original
      FROM public.p_prestamos p$a3$;
    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro la lista de SELECT de p_prestamos';
    END IF;
    v_def := replace(v_def, v_anchor, $b3$p.cuota_mensual, p.proximo_vencimiento, p.monto_original,
        p.saldo_al_ingreso, p.modalidad, p.condicion_interes, p.interes_total_acordado,
        p.tasa_informada, p.puntos_vinculo, p.eliminado_at
      FROM public.p_prestamos p$b3$);

    -- 3. Order the copy by id and append the map plus the three dependent tables.
    v_anchor := $a4$      LEFT JOIN _map_caja mc ON mc.old_id = p.p_caja_id
     WHERE p.user_id = p_user_id_origen;$a4$;
    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el WHERE de la copia de p_prestamos';
    END IF;
    v_def := replace(v_def, v_anchor, $b4$      LEFT JOIN _map_caja mc ON mc.old_id = p.p_caja_id
     WHERE p.user_id = p_user_id_origen
     ORDER BY p.prestamo_id;$b4$);

    v_anchor := $a5$    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos', v_filas_insertadas);$a5$;
    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el registro de auditoria de p_prestamos';
    END IF;
    v_def := replace(v_def, v_anchor, $b5$    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos', v_filas_insertadas);

    -- Mapa OLD -> NEW de p_prestamos. El destino se vacio en la fase 1 y se copio en
    -- orden de id, asi que el row_number de cada lado coincide exacto.
    INSERT INTO _map_prestamo (old_id, new_id)
    SELECT src.prestamo_id, dst.prestamo_id
      FROM (SELECT prestamo_id, row_number() OVER (ORDER BY prestamo_id) AS rn
              FROM public.p_prestamos WHERE user_id = p_user_id_origen) src
      JOIN (SELECT prestamo_id, row_number() OVER (ORDER BY prestamo_id) AS rn
              FROM public.p_prestamos WHERE user_id = v_user_id_destino) dst
        ON src.rn = dst.rn;

    -- 3.11b p_prestamos_cuotas
    INSERT INTO public.p_prestamos_cuotas
        (prestamo_id, user_id, numero_cuota, fecha_vencimiento, monto_cuota,
         capital_componente, interes_componente, moneda)
    SELECT mp.new_id, v_user_id_destino, c.numero_cuota, c.fecha_vencimiento,
           c.monto_cuota, c.capital_componente, c.interes_componente, c.moneda
      FROM public.p_prestamos_cuotas c
      JOIN _map_prestamo mp ON mp.old_id = c.prestamo_id
     WHERE c.user_id = p_user_id_origen
     ORDER BY c.prestamo_id, c.numero_cuota;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos_cuotas', v_filas_insertadas);

    -- 3.11c p_prestamos_pagos (depende de p_prestamos, p_caja y p_billeteras)
    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha, billetera_id,
         moneda_billetera, monto_billetera, moneda_prestamo, monto_aplicado,
         capital_aplicado, interes_aplicado, interes_excedente, nota, estado, corregido_at)
    SELECT mp.new_id, v_user_id_destino, mc.new_id, g.direccion, g.fecha, mb.new_id,
           g.moneda_billetera, g.monto_billetera, g.moneda_prestamo, g.monto_aplicado,
           g.capital_aplicado, g.interes_aplicado, g.interes_excedente, g.nota,
           g.estado, g.corregido_at
      FROM public.p_prestamos_pagos g
      JOIN _map_prestamo mp ON mp.old_id = g.prestamo_id
      LEFT JOIN _map_caja mc ON mc.old_id = g.p_caja_id
      LEFT JOIN _map_billeteras mb ON mb.old_id = g.billetera_id
     WHERE g.user_id = p_user_id_origen
     ORDER BY g.pago_id;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos_pagos', v_filas_insertadas);

    -- 3.11d p_prestamos_vinculos
    INSERT INTO public.p_prestamos_vinculos
        (prestamo_id, user_id, criterio, seleccionado, actualizado_at)
    SELECT mp.new_id, v_user_id_destino, v.criterio, v.seleccionado, v.actualizado_at
      FROM public.p_prestamos_vinculos v
      JOIN _map_prestamo mp ON mp.old_id = v.prestamo_id
     WHERE v.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos_vinculos', v_filas_insertadas);$b5$);

    EXECUTE v_def;
    RAISE NOTICE 'fn_clonar_usuario_admin: prestamos, cuotas, pagos y vinculos incluidos';
END $fix$;

COMMIT;
