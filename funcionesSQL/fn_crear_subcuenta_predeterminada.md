CREATE OR REPLACE FUNCTION public.fn_crear_subcuenta_predeterminada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_icono_candidato text;
    v_pool_iconos text[] := ARRAY['🛒','🍏','🥩','🍞','🥛','🍕','🍔','🌮','🍣','🍿','☕','🍺','🍷','🍦','🍩','🍫','🍽️','🍹','🥤','🍾','🏠','💡','🚰','🔥','🔌','🧹','🛋️','🔑','🛏️','🧺','🚗','🚲','🏍️','🚌','✈️','⛽','🎫','🚕','🚇','🚜','🐶','🐱','🦜','🐟','🐾','🦴','🐹','🐰','🐢','🐠','⚽','🏀','🏋️','🚴','🏃','🎾','⛳','🥊','🎿','🛹','🎭','🎬','🎮','🎤','🎧','🎼','🎟️','🎲','🧩','🎳','🏥','💊','🩹','🦷','🧴','💇','🕶️','🧼','🧘','🛍️','👕','👗','👟','👠','👜','🎒','🧢','💍','⌚','💻','📱','📺','🖥️','🖨️','💼','📝','📁','📊','🛠️'];
    v_ico text;
BEGIN
    IF NEW.padre_id IS NOT NULL THEN RETURN NEW; END IF;
    v_icono_candidato := '🔹'; 
    
    FOREACH v_ico IN ARRAY v_pool_iconos LOOP
        IF NOT EXISTS (SELECT 1 FROM public.p_estructuras_egresos WHERE user_id = NEW.user_id AND icono = v_ico) THEN
            v_icono_candidato := v_ico; EXIT; 
        END IF;
    END LOOP;

    INSERT INTO public.p_estructuras_egresos (padre_id, user_id, nombre_cuenta, descripcion, tipo_cupo, hogar_id, icono, color)
    VALUES (NEW.estructura_id, NEW.user_id, 'no_detail', 'desc_quick_load', NEW.tipo_cupo, NEW.hogar_id, v_icono_candidato, NEW.color);
    
    RETURN NEW;
END;
$function$