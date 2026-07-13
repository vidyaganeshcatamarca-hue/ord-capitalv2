-- Test manual para Supabase SQL Editor.
-- Simula JWT con un auth_id real porque auth.uid() es NULL en SQL Editor.

BEGIN;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_id::text FROM public.usuarios WHERE auth_id IS NOT NULL LIMIT 1),
  true
);

-- Simula el caso que reportó la app: usuario sin fila de preferencias.
DELETE FROM public.p_preferencias_usuario
WHERE user_id = (
  SELECT user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid()
);

-- Debe recrear la fila por default y devolver una fila.
SELECT * FROM public.fn_obtener_preferencias_usuario();

-- Debe guardar sin error aunque la fila haya faltado antes.
SELECT public.fn_actualizar_preferencia_usuario(
  p_decimales_moneda_local := 2::smallint,
  p_decimales_segunda_moneda := 1::smallint,
  p_separador_miles := '.',
  p_separador_decimal := ','
);

SELECT
  decimales_moneda_local,
  decimales_segunda_moneda,
  separador_miles,
  separador_decimal
FROM public.fn_obtener_preferencias_usuario();

-- Resultado esperado:
-- decimales_moneda_local = 2
-- decimales_segunda_moneda = 1
-- separador_miles = .
-- separador_decimal = ,

ROLLBACK;
