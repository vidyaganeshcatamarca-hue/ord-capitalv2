CREATE OR REPLACE FUNCTION public.fn_t_capturar_porcentajes_hogar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_pct_creador numeric;
    v_pct_invitado numeric;
    v_hogar_id int8;
BEGIN
    -- Si el egreso se marca como compartido, pescamos la foto actual del hogar
    IF NEW.es_compartido = true THEN
        SELECT h.porcentaje_usuario_creador, h.porcentaje_usuario_invitado, hp.hogar_id
        INTO v_pct_creador, v_pct_invitado, v_hogar_id
        FROM p_hogar_participantes hp
        INNER JOIN p_hogares h ON hp.hogar_id = h.hogar_id
        WHERE hp.user_id = NEW.user_id;

        -- Inyectamos los datos automáticamente en la fila que se está insertando
        NEW.hogar_id := v_hogar_id;
        NEW.porcentaje_creador_snapshot := COALESCE(v_pct_creador, 50.00);
        NEW.porcentaje_invitado_snapshot := COALESCE(v_pct_invitado, 50.00);
    END IF;

    RETURN NEW;
END;
$function$