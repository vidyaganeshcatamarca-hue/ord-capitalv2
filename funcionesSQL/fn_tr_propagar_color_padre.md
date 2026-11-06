CREATE OR REPLACE FUNCTION public.fn_tr_propagar_color_padre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_hijo RECORD;
    v_posicion int := 0;
    v_total_hijos int;
BEGIN
    -- Solo actuar si el campo 'color' cambió Y es un Rubro Padre
    IF OLD.color IS DISTINCT FROM NEW.color AND NEW.padre_id IS NULL THEN
        
        SELECT COUNT(*) INTO v_total_hijos
        FROM public.p_estructuras_egresos
        WHERE padre_id = NEW.estructura_id AND user_id = NEW.user_id;
        
        FOR v_hijo IN 
            SELECT estructura_id 
            FROM public.p_estructuras_egresos
            WHERE padre_id = NEW.estructura_id AND user_id = NEW.user_id
            ORDER BY nombre_cuenta ASC
        LOOP
            UPDATE public.p_estructuras_egresos
            SET color = public.fn_generar_variacion_color(
                NEW.color, 
                v_posicion, 
                v_total_hijos
            )
            WHERE estructura_id = v_hijo.estructura_id;
            
            v_posicion := v_posicion + 1;
        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$function$