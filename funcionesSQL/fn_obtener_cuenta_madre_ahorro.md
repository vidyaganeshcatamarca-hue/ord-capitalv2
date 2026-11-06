CREATE OR REPLACE FUNCTION public.fn_obtener_cuenta_madre_ahorro()
RETURNS TABLE(
  billetera_id bigint,
  nombre text,
  moneda text,
  saldo_actual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  RETURN QUERY
  SELECT
    b.billetera_id,
    b.nombre::text,
    b.moneda::text,
    b.saldo_actual::numeric
  FROM public.p_billeteras b
  WHERE b.user_id = v_user_id
    AND b.activa = true
    AND b.es_cuenta_madre_ahorro = true
  ORDER BY b.billetera_id ASC
  LIMIT 1;
END;
$function$
