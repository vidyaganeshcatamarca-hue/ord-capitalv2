CREATE OR REPLACE FUNCTION public.fn_confirmar_ticket_ocr_cuarentena(p_pendiente_id bigint)
 RETURNS TABLE(grupo_orden integer, estructura_egreso_id bigint, monto numeric, p_caja_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_rec RECORD;
    v_items jsonb;
    v_resolved jsonb;
    v_fallback_id bigint;
    v_subtotal_cents bigint;
    v_discount_cents bigint;
    v_ticket_total_cents bigint;
    v_bad_categories int;
    v_g RECORD;
    v_meta jsonb;
    v_caja_id bigint;
    v_moneda text;
    v_saldo numeric;
    v_nombre text;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_dia_compra int;
    v_monto_cuota numeric;
    v_mes_compra date;
    v_base_date date;
    v_fecha_estimada date;
    v_mes_periodo date;
    v_i int;
    v_cuotas int;
    v_checked_residue boolean := false;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Bloqueo de la fila: serializa dos confirmaciones concurrentes.
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

    v_items := COALESCE(v_rec.metadata->'items', '[]'::jsonb);
    IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_items_required", "params": {}}';
    END IF;

    -- PRD §83: el total del ticket es la referencia del cierre.
    IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
    END IF;
    v_ticket_total_cents := round(v_rec.monto * 100)::bigint;

    -- Fallback contable: la categoría de sistema del usuario (se provisiona si
    -- faltara). Nunca se aprende como memoria ni se ofrece al clasificador.
    v_fallback_id := public.fn_ocr_categoria_id(v_user_id);

    -- Items con importe > 0 (PRD §87) y su categoría final resuelta.
    WITH it AS (
        SELECT
            COALESCE(NULLIF(i.item->>'item_index', '')::int, (i.ord - 1)::int) AS item_index,
            round(COALESCE(NULLIF(i.item->>'net_amount', '')::numeric, 0) * 100)::bigint AS net_cents,
            NULLIF(btrim(COALESCE(i.item->>'current_category_id', '')), '') AS cat_raw,
            i.ord
        FROM jsonb_array_elements(v_items) WITH ORDINALITY AS i(item, ord)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'item_index', x.item_index,
               'net_cents', x.net_cents,
               'cat_id', CASE
                            WHEN x.cat_raw IS NOT NULL AND x.cat_raw ~ '^[0-9]+$'
                            THEN x.cat_raw::bigint
                            ELSE v_fallback_id
                         END
           )), '[]'::jsonb)
    INTO v_resolved
    FROM it x
    WHERE x.net_cents > 0;

    SELECT COALESCE(SUM((r->>'net_cents')::bigint), 0) INTO v_subtotal_cents
    FROM jsonb_array_elements(v_resolved) r;

    IF v_subtotal_cents <= 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
    END IF;

    -- Toda categoría elegida debe seguir existiendo para el usuario (PRD §84).
    SELECT count(*) INTO v_bad_categories
    FROM (
        SELECT DISTINCT (r->>'cat_id')::bigint AS cat_id
        FROM jsonb_array_elements(v_resolved) r
    ) d
    WHERE d.cat_id <> v_fallback_id
      AND NOT EXISTS (
          SELECT 1 FROM public.p_estructuras_egresos e
          WHERE e.estructura_id = d.cat_id AND e.user_id = v_user_id
      );

    IF v_bad_categories > 0 THEN
        RAISE EXCEPTION '{"key": "error_ocr_category_missing", "params": {}}';
    END IF;

    -- Descuento general: proporcional y acotado al subtotal (§12).
    v_discount_cents := round(
        abs(COALESCE(NULLIF(v_rec.metadata->>'general_discount', '')::numeric, 0)) * 100
    )::bigint;
    v_discount_cents := LEAST(v_discount_cents, v_subtotal_cents);

    -- ── Fuente de pago (una por ticket, PRD §7) ────────────────────────────
    IF v_rec.tipo = 'card_expense' THEN
        IF v_rec.tarjeta_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "tarjeta"}}';
        END IF;

        SELECT upper(btrim(COALESCE(tc.moneda_iso, ''))), tc.dia_cierre, tc.dia_vencimiento
        INTO v_moneda, v_dia_cierre, v_dia_vencimiento
        FROM public.p_tarjetas_credito tc
        WHERE tc.tarjeta_id = v_rec.tarjeta_id AND tc.user_id = v_user_id;

        -- Sin fila, la tarjeta no existe para este usuario (PRD §84).
        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
        END IF;

        v_cuotas := GREATEST(COALESCE(v_rec.cuotas, 1), 1);
        v_dia_compra := EXTRACT(DAY FROM v_rec.fecha)::int;
        v_mes_compra := date_trunc('month', v_rec.fecha);
        IF v_dia_compra <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_mes_compra;
        ELSE
            v_base_date := v_mes_compra + INTERVAL '1 month';
        END IF;
        IF COALESCE(v_dia_vencimiento, v_dia_compra) <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_base_date + INTERVAL '1 month';
        END IF;
    ELSE
        IF v_rec.billetera_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billetera_origen"}}';
        END IF;

        -- La billetera que paga debe cubrir el TOTAL del ticket: se bloquea la
        -- fila para serializar dos confirmaciones que gasten el mismo saldo.
        SELECT b.saldo_actual, b.nombre, b.moneda
        INTO v_saldo, v_nombre, v_moneda
        FROM public.p_billeteras b
        WHERE b.billetera_id = v_rec.billetera_id AND b.user_id = v_user_id
        FOR UPDATE;

        IF v_saldo IS NULL THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
        IF v_saldo < v_rec.monto THEN
            RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {"nombre": "%", "saldo": %}}',
                v_nombre, v_saldo;
        END IF;
    END IF;

    IF v_moneda IS NULL OR v_moneda !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION '{"key": "error_ocr_currency_invalid", "params": {}}';
    END IF;

    v_meta := jsonb_build_object(
        'origen_cuarentena', 'ocr',
        'quarantine_id', p_pendiente_id,
        'ocr_job_id', v_rec.metadata->>'ocr_job_id',
        'ocr_item_count', jsonb_array_length(v_items),
        'ocr_group_count_total', 0
    );

    -- ── Grupos + descuento proporcional + cierre ───────────────────────────
    -- Reparto por mayor residuo: la suma de los descuentos por grupo es
    -- EXACTAMENTE el descuento general, sin perder un centavo.
    FOR v_g IN
        WITH grp AS (
            SELECT (r->>'cat_id')::bigint AS cat_id,
                   SUM((r->>'net_cents')::bigint)::bigint AS subtotal_cents,
                   MIN((r->>'item_index')::int) AS first_index
            FROM jsonb_array_elements(v_resolved) r
            GROUP BY 1
        ), disc AS (
            SELECT g.cat_id, g.subtotal_cents, g.first_index,
                   (v_discount_cents * g.subtotal_cents) / v_subtotal_cents AS base_disc,
                   (v_discount_cents * g.subtotal_cents) % v_subtotal_cents AS rem
            FROM grp g
        ), ranked AS (
            SELECT d.*,
                   ROW_NUMBER() OVER (ORDER BY d.rem DESC, d.subtotal_cents DESC, d.first_index ASC) AS rem_rank,
                   ROW_NUMBER() OVER (ORDER BY d.subtotal_cents DESC, d.first_index ASC) AS size_rank
            FROM disc d
        ), spread AS (
            SELECT r.*, v_discount_cents - SUM(r.base_disc) OVER () AS leftover
            FROM ranked r
        ), fin AS (
            SELECT s.cat_id, s.subtotal_cents, s.first_index, s.size_rank,
                   s.base_disc + CASE WHEN s.rem_rank <= s.leftover THEN 1 ELSE 0 END AS disc_cents
            FROM spread s
        ), res AS (
            SELECT f.*,
                   v_ticket_total_cents - SUM(f.subtotal_cents - f.disc_cents) OVER () AS residue
            FROM fin f
        )
        SELECT r.cat_id,
               r.subtotal_cents,
               r.disc_cents,
               r.residue,
               (r.subtotal_cents - r.disc_cents
                + CASE WHEN r.size_rank = 1 AND abs(r.residue) <= 5
                            AND r.subtotal_cents - r.disc_cents + r.residue >= 0
                       THEN r.residue ELSE 0 END) AS final_cents,
               ROW_NUMBER() OVER (ORDER BY r.first_index)::int AS grupo_orden
        FROM res r
        ORDER BY r.first_index
    LOOP
        -- El residuo es el mismo en todas las filas: se valida una sola vez y
        -- ANTES de crear nada material (PRD §89).
        IF NOT v_checked_residue THEN
            v_checked_residue := true;
            IF abs(v_g.residue) > 5 THEN
                RAISE EXCEPTION '{"key": "error_ocr_total_mismatch", "params": {}}';
            END IF;
        END IF;

        -- Importe cero: no genera movimiento (§87).
        CONTINUE WHEN v_g.final_cents <= 0;

        IF v_rec.tipo = 'card_expense' THEN
            INSERT INTO public.p_caja (
                user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso,
                fecha, es_compartido, estructura_egreso_id, detalle, metadata,
                cuotas_totales, es_usd, moneda
            )
            VALUES (
                v_user_id, 'expense', v_rec.tarjeta_id, (v_g.final_cents::numeric / 100), 0,
                v_rec.fecha, false, v_g.cat_id, v_rec.detalle,
                v_meta || jsonb_build_object(
                    'ocr_group_index', v_g.grupo_orden,
                    'ocr_group_category_id', v_g.cat_id,
                    'ocr_group_subtotal', (v_g.subtotal_cents::numeric / 100),
                    'ocr_group_discount', (v_g.disc_cents::numeric / 100)
                ),
                v_cuotas, (v_moneda = 'USD'), v_moneda
            )
            RETURNING p_caja.p_caja_id INTO v_caja_id;

            -- Mismas cuotas que el flujo manual y que la aprobación de
            -- cuarentena: sin p_cuotas_detalle la compra no aparece en el
            -- resumen de la tarjeta.
            v_monto_cuota := (v_g.final_cents::numeric / 100) / v_cuotas;
            FOR v_i IN 0..(v_cuotas - 1) LOOP
                v_fecha_estimada := (v_base_date + (v_i || ' months')::interval)
                    + (COALESCE(v_dia_vencimiento, v_dia_compra) - 1) * INTERVAL '1 day';
                SELECT date_trunc('month', fecha_inicio)::date INTO v_mes_periodo
                  FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_estimada);
                INSERT INTO public.p_cuotas_detalle (
                    user_id, tarjeta_id, numero_cuota, monto_cuota, moneda,
                    fecha_estimada_pago, pagado, p_caja_id
                ) VALUES (
                    v_user_id, v_rec.tarjeta_id, v_i + 1, v_monto_cuota, v_moneda,
                    v_fecha_estimada, false, v_caja_id
                );
                INSERT INTO public.p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
                VALUES (v_rec.tarjeta_id, v_user_id, v_monto_cuota, v_mes_periodo)
                ON CONFLICT (tarjeta_id, mes_periodo, user_id)
                DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
            END LOOP;
        ELSE
            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
                fecha, es_compartido, estructura_egreso_id, detalle, metadata,
                moneda, es_usd
            )
            VALUES (
                v_user_id, 'expense', v_rec.billetera_id, (v_g.final_cents::numeric / 100), 0,
                v_rec.fecha, false, v_g.cat_id, v_rec.detalle,
                v_meta || jsonb_build_object(
                    'ocr_group_index', v_g.grupo_orden,
                    'ocr_group_category_id', v_g.cat_id,
                    'ocr_group_subtotal', (v_g.subtotal_cents::numeric / 100),
                    'ocr_group_discount', (v_g.disc_cents::numeric / 100)
                ),
                v_moneda, (v_moneda = 'USD')
            )
            RETURNING p_caja.p_caja_id INTO v_caja_id;
        END IF;

        grupo_orden := v_g.grupo_orden;
        estructura_egreso_id := v_g.cat_id;
        monto := (v_g.final_cents::numeric / 100);
        p_caja_id := v_caja_id;
        RETURN NEXT;
    END LOOP;

    -- Sin grupos con importe no hay nada que confirmar: la fila sigue pendiente.
    IF NOT v_checked_residue THEN
        RAISE EXCEPTION '{"key": "error_ocr_amount_invalid", "params": {}}';
    END IF;

    UPDATE public.p_caja_cuarentena
    SET estado = 'procesado'
    WHERE pendiente_id = p_pendiente_id;

    RETURN;
END;
$function$;
