-- Loans / saneamiento rebuild — stage 6 (T17 part 1): make backups and user
-- deletion aware of the new tables.
--
-- Dependency check (required before touching shared functions). Three routines
-- enumerate tables by name, so they never learn about a new table on their own:
--
--   fn_exportar_backup_maestro        exported p_prestamos but not its schedule or
--                                     its operations -> a backup would restore loans
--                                     with no payments and no installments, silently.
--   fn_exportar_pasaporte_financiero  same.
--   fn_exportar_datos_usuario_rango   exported card installments only.
--   fn_borrar_datos_usuario           deletes table by table; leaving the new ones
--                                     out risks orphans or an FK failure.
--
-- fn_clonar_usuario_admin is deliberately NOT patched here. Its copy phase remaps
-- identities, and adding two tables without reviewing that remapping could corrupt
-- a clone. It is recorded as a known limitation in the task document instead.
--
-- Every patch asserts that its anchor existed and that the replacement happened,
-- so this migration fails loudly instead of silently doing nothing.

BEGIN;

DO $$
DECLARE
    v_def     text;
    v_oid     oid;
    v_antes   integer;
BEGIN
    -- -----------------------------------------------------------------
    -- 1. Backup maestro
    -- -----------------------------------------------------------------
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_exportar_backup_maestro';
    v_def := pg_get_functiondef(v_oid);

    IF position('prestamos_cuotas' IN v_def) = 0 THEN
        v_antes := position('''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id),' IN v_def);
        IF v_antes = 0 THEN
            RAISE EXCEPTION 'backup_maestro: no se encontro el ancla de prestamos';
        END IF;
        v_def := replace(v_def,
            '''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id),',
            '''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id),
        ''prestamos_cuotas'', (SELECT json_agg(row_to_json(c)) FROM public.p_prestamos_cuotas c WHERE c.user_id = v_user_id),
        ''prestamos_pagos'', (SELECT json_agg(row_to_json(g)) FROM public.p_prestamos_pagos g WHERE g.user_id = v_user_id),');
        IF position('prestamos_pagos' IN v_def) = 0 THEN
            RAISE EXCEPTION 'backup_maestro: el reemplazo no se aplico';
        END IF;
        EXECUTE v_def;
        RAISE NOTICE 'backup_maestro: cuotas y pagos agregados';
    END IF;

    -- -----------------------------------------------------------------
    -- 2. Pasaporte financiero
    -- -----------------------------------------------------------------
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_exportar_pasaporte_financiero';
    v_def := pg_get_functiondef(v_oid);

    IF position('prestamos_pagos' IN v_def) = 0 THEN
        IF position('''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id)' IN v_def) = 0 THEN
            RAISE EXCEPTION 'pasaporte: no se encontro el ancla de prestamos';
        END IF;
        v_def := replace(v_def,
            '''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id)',
            '''prestamos'', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id),
                ''prestamos_cuotas'', (SELECT json_agg(row_to_json(c)) FROM public.p_prestamos_cuotas c WHERE c.user_id = v_user_id),
                ''prestamos_pagos'', (SELECT json_agg(row_to_json(g)) FROM public.p_prestamos_pagos g WHERE g.user_id = v_user_id)');
        IF position('prestamos_pagos' IN v_def) = 0 THEN
            RAISE EXCEPTION 'pasaporte: el reemplazo no se aplico';
        END IF;
        EXECUTE v_def;
        RAISE NOTICE 'pasaporte: cuotas y pagos agregados';
    END IF;

    -- -----------------------------------------------------------------
    -- 3. Rango de datos: no exportaba prestamos en absoluto
    -- -----------------------------------------------------------------
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_exportar_datos_usuario_rango';
    v_def := pg_get_functiondef(v_oid);

    IF position('prestamos_pagos' IN v_def) = 0 THEN
        IF position('''cuotas_detalle'', (SELECT json_agg(row_to_json(cd)) FROM public.p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.fecha_estimada_pago BETWEEN p_fecha_inicio AND p_fecha_fin),' IN v_def) = 0 THEN
            RAISE EXCEPTION 'rango: no se encontro el ancla de cuotas_detalle';
        END IF;
        v_def := replace(v_def,
            '''cuotas_detalle'', (SELECT json_agg(row_to_json(cd)) FROM public.p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.fecha_estimada_pago BETWEEN p_fecha_inicio AND p_fecha_fin),',
            '''cuotas_detalle'', (SELECT json_agg(row_to_json(cd)) FROM public.p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.fecha_estimada_pago BETWEEN p_fecha_inicio AND p_fecha_fin),
        ''prestamos'', (SELECT json_agg(row_to_json(pr)) FROM public.p_prestamos pr WHERE pr.user_id = v_user_id),
        ''prestamos_cuotas'', (SELECT json_agg(row_to_json(c)) FROM public.p_prestamos_cuotas c WHERE c.user_id = v_user_id),
        ''prestamos_pagos'', (SELECT json_agg(row_to_json(g)) FROM public.p_prestamos_pagos g WHERE g.user_id = v_user_id AND g.fecha BETWEEN p_fecha_inicio AND p_fecha_fin),');
        IF position('prestamos_pagos' IN v_def) = 0 THEN
            RAISE EXCEPTION 'rango: el reemplazo no se aplico';
        END IF;
        EXECUTE v_def;
        RAISE NOTICE 'rango: prestamos, cuotas y pagos agregados';
    END IF;

    -- -----------------------------------------------------------------
    -- 4. Borrado de datos de usuario: los hijos antes que el padre
    -- -----------------------------------------------------------------
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';
    v_def := pg_get_functiondef(v_oid);

    IF position('p_prestamos_pagos' IN v_def) = 0 THEN
        IF position('''p_prestamos'',' IN v_def) = 0 THEN
            RAISE EXCEPTION 'borrar_datos_usuario: no se encontro p_prestamos en el arreglo';
        END IF;
        v_def := replace(v_def,
            '''p_prestamos'',' ,
            '''p_prestamos_pagos'',
        ''p_prestamos_cuotas'',
        ''p_prestamos'',');
        IF position('p_prestamos_pagos' IN v_def) = 0 THEN
            RAISE EXCEPTION 'borrar_datos_usuario: el reemplazo no se aplico';
        END IF;
        EXECUTE v_def;
        RAISE NOTICE 'borrar_datos_usuario: cuotas y pagos agregados antes de p_prestamos';
    END IF;
END $$;

COMMIT;
