-- Archivado definitivo. Exige saldo exactamente cero: sin tolerancia y sin escribir
-- el saldo (el modelo anterior toleraba 0,01 y después forzaba saldo = 0).
-- Archivar no borra movimientos ni historia. PRD: DF-18, DF-19, §8.3, CA-23.

CREATE OR REPLACE FUNCTION public.fn_sobre_archivar(p_sobre_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre public.p_sobres;
    v_saldo numeric;
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

    v_saldo := public.fn_sobre_saldo(p_sobre_id);
    IF v_saldo <> 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_archive_with_balance", "params": {"saldo": "{{saldo}}"}}';
    END IF;

    UPDATE public.p_sobres SET archivado_at = now(), actualizado_at = now()
    WHERE sobre_id = p_sobre_id AND user_id = v_user_id;
END;
$function$;
