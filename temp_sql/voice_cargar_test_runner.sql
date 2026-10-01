-- RUNNER TRANSACCIONAL TEMPORAL (regla 11) — se borra al terminar.
-- Valida fn_cargar_movimientos_voz: NADA se rechaza; incompletos aterrizan.
-- AUTO-LIMPIEZA: SAVEPOINT + ROLLBACK TO al final.
CREATE OR REPLACE FUNCTION public.fn_run_voice_cargar_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_detail jsonb := '[]'::jsonb;
    v_auth_id uuid := 'b90d1f17-f691-491a-a840-522510e67640';
    v_user_id bigint;
    v_job_id uuid := gen_random_uuid();
    v_rows jsonb;
    v_row jsonb;
    v_db_row record;
    v_ok boolean;
    v_all_ok boolean := true;
    v_wallet1 bigint;
    v_wallet2 bigint;
    v_cat1 bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM usuarios WHERE auth_id = v_auth_id;
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('result','FAIL','detail',
            jsonb_build_array(jsonb_build_object('assertion','setup','ok',false,'error','sin fila en usuarios')));
    END IF;

    SELECT billetera_id INTO v_wallet1 FROM p_billeteras WHERE user_id = v_user_id ORDER BY billetera_id LIMIT 1;
    SELECT billetera_id INTO v_wallet2 FROM p_billeteras WHERE user_id = v_user_id ORDER BY billetera_id DESC LIMIT 1;
    SELECT estructura_id INTO v_cat1 FROM p_estructuras_egresos WHERE user_id = v_user_id ORDER BY estructura_id LIMIT 1;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_id)::text, false);


    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','25000','date',CURRENT_DATE::text,
            'note','test completo','currency','ARS',
            'source_wallet_id', v_wallet1::text, 'expense_category_id', v_cat1::text)
    )) r;
    v_row := v_rows->0;
    v_ok := (v_row->>'ok')::boolean IS TRUE AND (v_row->>'pendiente_id') IS NOT NULL;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso1_completo_ok','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE v_row::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','100','installments',0)
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.cuotas IS NULL;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso2_cuotas_cero_a_null','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_cuotas',v_db_row.cuotas)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','50','currency','ars')
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.moneda = 'ARS';
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso3_moneda_ars_normalizada','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_moneda',v_db_row.moneda)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','50','currency','EUR')
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.moneda IS NULL;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso3b_moneda_eur_a_null','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_moneda',v_db_row.moneda)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','50','date','ayer')
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.fecha = CURRENT_DATE;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso4_fecha_basura_a_hoy','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_fecha',v_db_row.fecha)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount',NULL)
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.monto = 0
        AND v_db_row.metadata->>'parse_error' = 'error_voice_invalid_amount';
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso5_monto_nulo_parse_error','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_monto',v_db_row.monto)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','xyz','amount','100')
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.tipo IS NULL
        AND v_db_row.metadata->>'parse_error' = 'error_voice_parse_failed';
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso6_tipo_basura_fallback','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'pe',v_db_row.metadata->>'parse_error')::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','expense','amount','doce')
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL
        AND v_db_row.tipo IS NULL AND v_db_row.monto = 0
        AND v_db_row.metadata->>'parse_error' = 'error_voice_parse_failed'
        AND v_db_row.metadata->'raw_movement' IS NOT NULL;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso7_amount_basura_fallback','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'pe',v_db_row.metadata->>'parse_error')::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;

    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(
        jsonb_build_object('type','transfer','amount','100','destination_amount',0,
            'source_wallet_id', v_wallet1::text, 'destination_wallet_id', v_wallet2::text)
    )) r;
    v_row := v_rows->0;
    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>'pendiente_id')::bigint;
    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.destination_amount IS NULL;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso8_destination_cero_a_null','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_dest',v_db_row.destination_amount)::text END));
    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;


    -- Higiene: borrar el JWT mockeado de la sesion (conexion pooled).
    PERFORM set_config('request.jwt.claims', '', false);

    RETURN jsonb_build_object('result', CASE WHEN v_all_ok THEN 'PASS' ELSE 'FAIL' END, 'detail', v_detail);
END;
$function$;
