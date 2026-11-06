CREATE OR REPLACE FUNCTION public.fn_crear_categorias_defecto_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.tipo_sistema IN ('personal', 'ambos') THEN
        INSERT INTO public.p_estructuras_egresos (
            nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color, padre_id
        ) VALUES (
            'cat_mystery', 
            'sys_do_not_delete_reconciliation', 
            NEW.user_id, 'want', '⚠️', '#64748B', NULL
        );
    END IF;
    RETURN NEW;
END;
$function$