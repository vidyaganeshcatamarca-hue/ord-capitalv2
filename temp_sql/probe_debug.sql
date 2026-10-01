SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640"}', false) AS cfg;
SELECT jsonb_agg(to_jsonb(r)) AS resultado
FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('type','expense','amount','25000','date',CURRENT_DATE::text,'note','probe','currency','ARS')
)) r;
ROLLBACK;
