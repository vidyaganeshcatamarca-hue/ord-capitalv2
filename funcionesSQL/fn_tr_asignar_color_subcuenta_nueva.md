CREATE OR REPLACE FUNCTION public.fn_tr_asignar_color_subcuenta_nueva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_color_padre text;
    v_posicion int;
    v_total_hijos int;
BEGIN
    IF NEW.padre_id IS NOT NULL AND (NEW.color IS NULL OR NEW.color = '') THEN
        
        SELECT color INTO v_color_padre
        FROM public.p_estructuras_egresos
        WHERE estructura_id = NEW.padre_id;
        
        IF v_color_padre IS NOT NULL THEN
            SELECT COUNT(*) INTO v_total_hijos
            FROM public.p_estructuras_egresos
            WHERE padre_id = NEW.padre_id AND user_id = NEW.user_id;
            
            v_posicion := v_total_hijos - 1;
            
            UPDATE public.p_estructuras_egresos
            SET color = public.fn_generar_variacion_color(v_color_padre, v_posicion, v_total_hijos)
            WHERE estructura_id = NEW.estructura_id;
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$function$