-- ============================================================================
-- 98 — fn_guardar_ticket_ocr_cuarentena
--
-- Guarda el BORRADOR corregido. No crea movimientos (PRD OCR §17): la fila sigue
-- `estado = 'pendiente'`.
--
-- PRD OCR definitivo §16, §17, §53, §83, §84, §85, §86.
--
-- QUÉ PUEDE CAMBIAR EL USUARIO
--   fecha, items (categoría actual, importe final, cantidad, precio unitario,
--   descuentos, importe impreso), descuentos generales, total, billetera,
--   tarjeta, cuotas, moneda y el detalle (comercio).
--
-- QUÉ NO CAMBIA NUNCA DESDE ACÁ
--   `ocr_job_id`, `ocr_schema_version` y `original_result`: son la identidad y la
--   evidencia del ticket. Se reinyectan desde la fila existente, no del cliente,
--   así una edición visual no puede reescribir la trazabilidad (§16).
--
-- Las categorías se validan contra el estado ACTUAL del usuario (§85): si una
-- categoría fue eliminada, el guardado falla con error_category_not_found y la
-- UI pide elegir otra; el resultado OCR original no se toca (§84).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guardar_ticket_ocr_cuarentena(
    p_pendiente_id bigint,
    p_ticket jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_rec RECORD;
    v_items jsonb;
    v_item jsonb;
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
    v_cat text;
    v_existe boolean;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT c.* INTO v_rec
    FROM public.p_caja_cuarentena c
    WHERE c.pendiente_id = p_pendiente_id
      AND c.user_id = v_user_id
      AND c.estado = 'pendiente'
      AND c.origen = 'ocr'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;

    IF p_ticket IS NULL OR jsonb_typeof(p_ticket) <> 'object' THEN
        RAISE EXCEPTION '{"key": "error_ocr_ticket_invalid", "params": {}}';
    END IF;

    v_items := COALESCE(p_ticket->'items', '[]'::jsonb);
    IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_items_required", "params": {}}';
    END IF;

    -- Cada item: importe numérico y categoría vigente del usuario.
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
        IF COALESCE(NULLIF(v_item->>'net_amount', '')::numeric, -1) < 0 THEN
            RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
        END IF;

        v_cat := NULLIF(btrim(COALESCE(v_item->>'current_category_id', '')), '');
        IF v_cat IS NOT NULL AND v_cat ~ '^[0-9]+$' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.p_estructuras_egresos e
                WHERE e.estructura_id = v_cat::bigint AND e.user_id = v_user_id
            ) INTO v_existe;
            IF NOT v_existe THEN
                RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}';
            END IF;
        END IF;
    END LOOP;

    v_total := NULLIF(p_ticket->>'total', '')::numeric;
    IF v_total IS NULL OR v_total < 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
    END IF;

    v_descuento := COALESCE(NULLIF(p_ticket->>'general_discount', '')::numeric, 0);
    IF v_descuento < 0 THEN
        v_descuento := abs(v_descuento);
    END IF;

    v_fecha_raw := btrim(COALESCE(p_ticket->>'purchase_date', ''));
    IF v_fecha_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        v_fecha := to_date(v_fecha_raw, 'YYYY-MM-DD');
    ELSE
        RAISE EXCEPTION '{"key": "error_ocr_date_invalid", "params": {}}';
    END IF;

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
    ELSIF v_billetera_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.p_billeteras b
            WHERE b.billetera_id = v_billetera_id AND b.user_id = v_user_id AND b.activa = true
        ) INTO v_existe;
        IF NOT v_existe THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
        v_tipo := 'expense';
        v_tarjeta_id := NULL;
        SELECT b.moneda INTO v_moneda
        FROM public.p_billeteras b WHERE b.billetera_id = v_billetera_id;
    ELSE
        v_tipo := 'expense';
    END IF;

    IF v_moneda IS NULL OR v_moneda !~ '^[A-Z]{3}$' THEN
        v_moneda := upper(btrim(COALESCE(p_ticket->>'currency', '')));
    END IF;
    IF v_moneda IS NULL OR v_moneda !~ '^[A-Z]{3}$' THEN
        v_moneda := NULL;
    END IF;

    v_merchant := NULLIF(btrim(COALESCE(p_ticket->>'merchant', '')), '');

    -- La evidencia original y la identidad del job se conservan SIEMPRE desde la
    -- fila, nunca desde el cliente.
    v_metadata := COALESCE(v_rec.metadata, '{}'::jsonb) || p_ticket
        || jsonb_build_object(
               'ocr_job_id', COALESCE(v_rec.metadata->>'ocr_job_id', p_ticket->>'ocr_job_id'),
               'ocr_schema_version',
                   COALESCE(NULLIF(v_rec.metadata->>'ocr_schema_version', '')::int, 1),
               'original_result', COALESCE(v_rec.metadata->'original_result', 'null'::jsonb)
           );
    v_metadata := v_metadata - 'job_id';

    UPDATE public.p_caja_cuarentena
    SET tipo = v_tipo,
        billetera_id = v_billetera_id,
        tarjeta_id = v_tarjeta_id,
        monto = v_total,
        fecha = v_fecha,
        detalle = v_merchant,
        metadata = v_metadata,
        moneda = v_moneda,
        cuotas = CASE WHEN v_tipo = 'card_expense' THEN v_cuotas ELSE NULL END
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';
END;
$function$;

COMMENT ON FUNCTION public.fn_guardar_ticket_ocr_cuarentena(bigint, jsonb) IS
'OCR: persiste el borrador corregido del ticket sin crear movimientos ni sacarlo de pendiente.';
