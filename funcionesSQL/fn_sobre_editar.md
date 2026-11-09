-- Edita nombre, meta, fecha e icono. Si cambian meta o fecha, el plan se reinicia
-- HOY usando el saldo existente como base y conserva el historial.
-- La moneda no se edita: la FK compuesta (sobre_id, moneda) de los movimientos lo
-- impide igual. PRD: DF-14, §5.3, §16.2.

CREATE OR REPLACE FUNCTION public.fn_sobre_editar(p_sobre_id bigint, p_nombre text DEFAULT NULL::text, p_monto_meta numeric DEFAULT NULL::numeric, p_fecha_objetivo date DEFAULT NULL::date, p_icono text DEFAULT NULL::text, p_quitar_meta boolean DEFAULT false, p_quitar_fecha boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre public.p_sobres;
    v_nueva_meta numeric;
    v_nueva_fecha date;
    v_replanifica boolean := false;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;

    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;
    IF v_sobre.archivado_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_archived", "params": {}}';
    END IF;
    IF p_nombre IS NOT NULL AND length(btrim(p_nombre)) = 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_name_required", "params": {}}';
    END IF;
    IF p_monto_meta IS NOT NULL AND p_monto_meta <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_meta_invalid", "params": {}}';
    END IF;

    v_nueva_meta := CASE WHEN p_quitar_meta THEN NULL ELSE COALESCE(p_monto_meta, v_sobre.monto_meta) END;
    v_nueva_fecha := CASE WHEN p_quitar_fecha THEN NULL ELSE COALESCE(p_fecha_objetivo, v_sobre.fecha_objetivo) END;

    v_replanifica := (v_nueva_meta IS DISTINCT FROM v_sobre.monto_meta)
                  OR (v_nueva_fecha IS DISTINCT FROM v_sobre.fecha_objetivo);

    UPDATE public.p_sobres b
    SET nombre = COALESCE(btrim(p_nombre), b.nombre),
        monto_meta = v_nueva_meta,
        fecha_objetivo = v_nueva_fecha,
        icono = COALESCE(p_icono, b.icono),
        plan_inicio_at = CASE WHEN v_replanifica THEN CURRENT_DATE ELSE b.plan_inicio_at END,
        actualizado_at = now()
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;
END;
$function$;
