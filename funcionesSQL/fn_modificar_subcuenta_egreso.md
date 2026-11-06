CREATE OR REPLACE FUNCTION public.fn_modificar_subcuenta_egreso(p_subcuenta_id bigint, p_nombre text, p_descripcion text, p_icono text, p_es_deseo boolean, p_es_hormiga boolean, p_utilidad_placer smallint, p_flexibilidad_recorte smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE public.p_estructuras_egresos
    SET 
        nombre_cuenta = p_nombre,
        descripcion = p_descripcion,
        icono = p_icono,
        es_deseo = p_es_deseo,
        es_hormiga = p_es_hormiga,
        utilidad_placer = p_utilidad_placer,
        flexibilidad_recorte = p_flexibilidad_recorte
    WHERE estructura_id = p_subcuenta_id 
      AND user_id = v_user_id
      AND padre_id IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_category_edit_child_not_allowed", "params": {}}';
    END IF;
END; $function$