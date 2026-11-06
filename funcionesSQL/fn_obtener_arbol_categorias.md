CREATE OR REPLACE FUNCTION public.fn_obtener_arbol_categorias()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_arbol jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN 
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; 
    END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'estructura_id', padre.estructura_id,
            'nombre_cuenta', padre.nombre_cuenta,
            'icono', padre.icono,
            'color', padre.color,
            'tipo_cupo', padre.tipo_cupo,
            'utilidad_placer', padre.utilidad_placer,
            'flexibilidad_recorte', padre.flexibilidad_recorte,
            'hijos', COALESCE(hijos.json_hijos, '[]'::jsonb)
        ) ORDER BY padre.nombre_cuenta
    ) INTO v_arbol
    FROM p_estructuras_egresos padre
    LEFT JOIN (
        SELECT
            h.padre_id,
            jsonb_agg(
                jsonb_build_object(
                    'estructura_id', h.estructura_id,
                    'nombre_cuenta', h.nombre_cuenta,
                    'icono', h.icono,
                    'color', h.color,
                    'utilidad_placer', h.utilidad_placer,
                    'flexibilidad_recorte', h.flexibilidad_recorte,
                    'es_hormiga', h.es_hormiga
                ) ORDER BY h.nombre_cuenta
            ) AS json_hijos
        FROM p_estructuras_egresos h
        WHERE h.padre_id IS NOT NULL
          AND (h.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND h.hogar_id = v_hogar_id))
        GROUP BY h.padre_id
    ) hijos ON padre.estructura_id = hijos.padre_id
    WHERE padre.padre_id IS NULL
      AND (padre.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND padre.hogar_id = v_hogar_id));

    RETURN COALESCE(v_arbol, '[]'::jsonb);
END;
$function$