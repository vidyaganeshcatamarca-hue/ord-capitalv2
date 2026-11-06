CREATE OR REPLACE FUNCTION public.fn_handle_new_user_region()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- El pais y la moneda los define el onboarding, no un default.
    INSERT INTO public.p_config_region (user_id, pais_codigo, moneda_default, idioma_default)
    VALUES (NEW.user_id, NULL, NULL, 'es')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$function$
