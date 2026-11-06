CREATE OR REPLACE FUNCTION public.fn_crear_subcuenta_egreso(p_padre_id bigint, p_nombre text, p_descripcion text, p_icono text, p_es_deseo boolean DEFAULT false, p_es_hormiga boolean DEFAULT false, p_utilidad_placer smallint DEFAULT 5, p_flexibilidad_recorte smallint DEFAULT 5)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; 
    v_estructura_id bigint;
    v_tipo_cupo_padre text;
    v_hogar_id_padre bigint;
    v_color_padre text;
    v_icono_padre text;
    v_real_children int;
    v_nd_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT tipo_cupo, hogar_id, color, icono
    INTO v_tipo_cupo_padre, v_hogar_id_padre, v_color_padre, v_icono_padre
    FROM public.p_estructuras_egresos 
    WHERE estructura_id = p_padre_id AND user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_category_parent_not_found", "params": {}}'; END IF;

    -- Detect first real child: count non-no_detail children BEFORE inserting the new one
    SELECT COUNT(*) INTO v_real_children
    FROM public.p_estructuras_egresos
    WHERE padre_id = p_padre_id AND user_id = v_user_id AND nombre_cuenta <> 'no_detail';

    IF v_real_children = 0 THEN
        -- First real subcuenta: find or create no_detail, then migrate parent records
        SELECT estructura_id INTO v_nd_id
        FROM public.p_estructuras_egresos
        WHERE padre_id = p_padre_id AND user_id = v_user_id AND nombre_cuenta = 'no_detail';

        IF NOT FOUND THEN
            -- Legacy fallback: create no_detail inline using parent's attributes
            INSERT INTO public.p_estructuras_egresos (
                padre_id, user_id, nombre_cuenta, descripcion, icono, color, tipo_cupo, hogar_id
            )
            VALUES (
                p_padre_id, v_user_id, 'no_detail', 'desc_quick_load',
                v_icono_padre, v_color_padre, v_tipo_cupo_padre, v_hogar_id_padre
            )
            RETURNING estructura_id INTO v_nd_id;
        END IF;

        -- Migrate all parent-pointing rows to no_detail
        UPDATE public.p_caja
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_gastos_recurrentes
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_caja_cuarentena
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_gastos_fijos_config
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        -- Budget merge: INSERT parent rows into no_detail, sum on conflict, then DELETE originals
        INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
        SELECT v_nd_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla
        FROM public.p_presupuestos
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id
        ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))
        DO UPDATE SET monto_limite = p_presupuestos.monto_limite + EXCLUDED.monto_limite;

        DELETE FROM public.p_presupuestos
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;
    END IF;

    INSERT INTO public.p_estructuras_egresos (
        padre_id, user_id, nombre_cuenta, descripcion, icono, 
        es_deseo, es_hormiga, utilidad_placer, flexibilidad_recorte, 
        tipo_cupo, hogar_id
    )
    VALUES (
        p_padre_id, v_user_id, p_nombre, p_descripcion, p_icono, 
        p_es_deseo, p_es_hormiga, p_utilidad_placer, p_flexibilidad_recorte,
        v_tipo_cupo_padre, v_hogar_id_padre
    ) 
    RETURNING estructura_id INTO v_estructura_id;
    
    RETURN v_estructura_id;
END; $function$
