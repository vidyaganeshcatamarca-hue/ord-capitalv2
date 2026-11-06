CREATE OR REPLACE FUNCTION public.fn_desarchivar_tarjeta_credito(p_tarjeta_id bigint)
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

     UPDATE p_tarjetas_credito SET activa = true
     WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

     IF NOT FOUND THEN
         RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
     END IF;
 END;
 $function$;
