<!--
DEPRECATED: Reemplazada por el flujo api.ordcapital.app + fn_cargar_movimientos_voz.
Esta RPC queda en Supabase solo para no romper integraciones legacy. NO usar para cargas nuevas.
-->

CREATE OR REPLACE FUNCTION public.fn_disparar_procesamiento_voz(
    p_audio_url text,
    p_billetera_sugerida text DEFAULT NULL::text,
    p_fecha date DEFAULT CURRENT_DATE
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    INSERT INTO public.p_caja_cuarentena (
        user_id, origen, monto, fecha, detalle, estado, metadata
    ) VALUES (
        v_user_id, 'voz', 0, p_fecha, 'Audio pendiente de procesamiento IA',
        'pending',
        jsonb_build_object('audio_url', p_audio_url, 'billetera_sugerida', p_billetera_sugerida)
    );

    INSERT INTO public.p_webhook_queue (
        user_id, tipo_evento, payload, estado, creado_at
    ) VALUES (
        v_user_id,
        'voz_procesar',
        jsonb_build_object('audio_url', p_audio_url, 'user_id', v_user_id),
        'pendiente',
        now()
    );
END;
$function$
