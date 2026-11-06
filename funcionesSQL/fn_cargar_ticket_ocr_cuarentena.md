CREATE OR REPLACE FUNCTION public.fn_cargar_ticket_ocr_cuarentena(p_job_id text, p_ticket jsonb, p_original_result jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(pendiente_id bigint, created boolean, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_existente RECORD;
    v_items jsonb;
    v_total numeric;
    v_descuento numeric;
    v_fecha date;
    v_fecha_raw text;
    v_moneda text;
    v_tipo text;
    v_billetera_id bigint;
    v_tarjeta_id bigint;
    v_cuotas integer;
    v_merchant text;
    v_metadata jsonb;
    v_pendiente_id bigint;
    v_existe boolean;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_job_id IS NULL OR btrim(p_job_id) = '' THEN
        RAISE EXCEPTION '{"key": "error_ocr_job_id_required", "params": {}}';
    END IF;
    IF p_ticket IS NULL OR jsonb_typeof(p_ticket) <> 'object' THEN
        RAISE EXCEPTION '{"key": "error_ocr_ticket_invalid", "params": {}}';
    END IF;

    -- Serializa dos despachos concurrentes del mismo job (frontend + RPC).
    PERFORM pg_advisory_xact_lock(hashtext('ocr_quarantine:' || v_user_id::text || ':' || p_job_id));

    SELECT c.pendiente_id, c.estado INTO v_existente
    FROM public.p_caja_cuarentena c
    WHERE c.user_id = v_user_id
      AND c.origen = 'ocr'
      AND c.metadata->>'ocr_job_id' = p_job_id
      AND c.estado <> 'rechazado'
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT v_existente.pendiente_id, false, v_existente.estado;
        RETURN;
    END IF;

    -- ── Items ────────────────────────────────────────────────────────────────
    v_items := COALESCE(p_ticket->'items', '[]'::jsonb);
    IF jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION '{"key": "error_ocr_ticket_invalid", "params": {}}';
    END IF;
    IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_items_required", "params": {}}';
    END IF;

    -- ── Total: el del ticket; si no sirve, la suma de los netos ─────────────
    v_total := NULLIF(p_ticket->>'total', '')::numeric;
    IF v_total IS NULL OR v_total <= 0 THEN
        SELECT COALESCE(SUM(COALESCE(NULLIF(i.item->>'net_amount', '')::numeric, 0)), 0)
        INTO v_total
        FROM jsonb_array_elements(v_items) AS i(item);
    END IF;
    IF v_total IS NULL OR v_total <= 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
    END IF;

    v_descuento := COALESCE(NULLIF(p_ticket->>'general_discount', '')::numeric, 0);
    IF v_descuento < 0 THEN
        v_descuento := abs(v_descuento);
    END IF;

    -- ── Fecha: la del ticket, o hoy. Nunca una fecha inventada. ─────────────
    v_fecha_raw := btrim(COALESCE(p_ticket->>'purchase_date', ''));
    IF v_fecha_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND to_date(v_fecha_raw, 'YYYY-MM-DD') IS NOT NULL THEN
        v_fecha := to_date(v_fecha_raw, 'YYYY-MM-DD');
    ELSE
        v_fecha := CURRENT_DATE;
    END IF;

    -- ── Forma de pago: una sola por ticket (PRD §7) ─────────────────────────
    v_tarjeta_id := NULLIF(p_ticket->'payment'->>'card_id', '')::bigint;
    v_billetera_id := NULLIF(p_ticket->'payment'->>'wallet_id', '')::bigint;
    v_cuotas := GREATEST(COALESCE(NULLIF(p_ticket->'payment'->>'installments', '')::int, 1), 1);

    IF v_tarjeta_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.p_tarjetas_credito t
            WHERE t.tarjeta_id = v_tarjeta_id AND t.user_id = v_user_id
        ) INTO v_existe;
        IF NOT v_existe THEN
            RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
        END IF;
        v_tipo := 'card_expense';
        v_billetera_id := NULL;
        SELECT upper(btrim(COALESCE(t.moneda_iso, ''))) INTO v_moneda
        FROM public.p_tarjetas_credito t WHERE t.tarjeta_id = v_tarjeta_id;
    ELSE
        IF v_billetera_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.p_billeteras b
                WHERE b.billetera_id = v_billetera_id AND b.user_id = v_user_id AND b.activa = true
            ) INTO v_existe;
            IF NOT v_existe THEN
                RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
            END IF;
            SELECT b.moneda INTO v_moneda
            FROM public.p_billeteras b WHERE b.billetera_id = v_billetera_id;
        END IF;
        v_tipo := 'expense';
        v_tarjeta_id := NULL;
    END IF;

    -- Moneda: la de la fuente de pago manda; si no hay, la del ticket.
    IF v_moneda IS NULL OR v_moneda !~ '^[A-Z]{3}$' THEN
        v_moneda := upper(btrim(COALESCE(p_ticket->>'currency', '')));
    END IF;
    IF v_moneda IS NULL OR v_moneda !~ '^[A-Z]{3}$' THEN
        v_moneda := NULL;
    END IF;

    v_merchant := NULLIF(btrim(COALESCE(p_ticket->>'merchant', '')), '');

    -- ── Metadata: el ticket completo + evidencia original ───────────────────
    v_metadata := p_ticket
        || jsonb_build_object(
               'ocr_job_id', p_job_id,
               'ocr_schema_version', COALESCE(NULLIF(p_ticket->>'ocr_schema_version', '')::int, 1),
               'original_result', to_jsonb(p_original_result)
           );
    -- Blindaje: una clave `job_id` en metadata haría que el frontend tratara la
    -- fila como Voice (PRD §51). Se elimina si el backend la hubiera mandado.
    v_metadata := v_metadata - 'job_id';

    INSERT INTO public.p_caja_cuarentena (
        user_id, origen, tipo, billetera_id, tarjeta_id,
        monto, fecha, detalle, metadata, estado, moneda, cuotas,
        estructura_egreso_id
    )
    VALUES (
        v_user_id, 'ocr', v_tipo, v_billetera_id, v_tarjeta_id,
        v_total, v_fecha, v_merchant, v_metadata, 'pendiente', v_moneda,
        CASE WHEN v_tipo = 'card_expense' THEN v_cuotas ELSE NULL END,
        NULL
    )
    RETURNING p_caja_cuarentena.pendiente_id INTO v_pendiente_id;

    RETURN QUERY SELECT v_pendiente_id, true, 'pendiente'::text;
END;
$function$;
