CREATE OR REPLACE FUNCTION public.fn_obtener_billeteras_ordenadas(p_orden text DEFAULT 'valor'::text)
 RETURNS TABLE(billetera_id bigint, nombre text, moneda text, saldo_actual numeric, es_fondo_prevision boolean, ultima_conciliacion_at timestamp with time zone, icono text, es_compartida boolean, saldo_inicial_pendiente boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_hogar_id bigint;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  SELECT hogar_id INTO v_hogar_id
  FROM public.p_hogar_participantes
  WHERE user_id = v_user_id;

  RETURN QUERY
  SELECT
    b.billetera_id,
    b.nombre::text,
    b.moneda::text,
    b.saldo_actual::numeric,
    b.es_fondo_prevision,
    b.ultima_conciliacion_at,
    b.icono::text,
    b.es_compartida,
    b.saldo_inicial_pendiente
  FROM public.p_billeteras b
  WHERE b.activa = true
    AND (
      b.user_id = v_user_id
      OR (
        v_hogar_id IS NOT NULL
        AND b.es_compartida = true
        AND b.user_id IN (
          SELECT hp.user_id
          FROM public.p_hogar_participantes hp
          WHERE hp.hogar_id = v_hogar_id
        )
      )
    )
  ORDER BY
    CASE WHEN p_orden = 'valor' THEN b.moneda END ASC,
    CASE WHEN p_orden = 'valor' THEN b.saldo_actual END DESC,
    CASE WHEN p_orden = 'alfabetico' THEN LOWER(b.nombre) END ASC;
END;
$function$;
