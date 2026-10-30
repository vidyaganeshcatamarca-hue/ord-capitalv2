-- 148: fn_reporte_escudo_tiempo(uuid), la version vieja que el dueno pidio arreglar.
--
-- Defectos corregidos:
--   1. Comparaba user_id (bigint) contra p_user_id (uuid): la funcion fallaba siempre
--      con 'operator does not exist: bigint = uuid'. Ahora resuelve el user_id desde
--      usuarios.auth_id, que es lo que un llamador con auth.uid() espera pasar.
--   2. Pisaba v_gasto_fijo_prom_180 con la cotizacion del USD
--      (SELECT valor_por_usd FROM p_divisas INTO v_gasto_fijo_prom_180). Eliminada.
--   3. Devolvia calificacion y mensaje con texto en español hardcodeado, contra la
--      regla 9 del proyecto. Ahora devuelve el mismo vocabulario que el overload
--      vigente ('safe' | 'warning' | 'critical') y mensaje NULL: la UI arma el texto
--      con claves, como ya hace con el overload sin argumentos.
--   4. (encontrado al arreglar) Dividia el ingreso por 6 y los gastos no: restaba un
--      promedio mensual contra un total de 180 dias. Ahora los tres son promedios
--      mensuales.
--   5. (encontrado al arreglar) Llamaba a fn_dias_escudo(numeric, numeric), un helper que
--      NO EXISTE en ningun schema: la funcion nunca pudo devolver nada. Los dias se
--      calculan ahora aca mismo. FORMULA A REVISAR POR EL DUENO: dias = ahorro mensual
--      dividido el gasto diario (gasto fijo + variable entre 30). Es el equivalente mas
--      cercano a "cuanto aguanto con lo que ahorro", sin inventar un capital que esta
--      funcion no recibe.
--
-- Criterio de fijo vs variable, que antes era el mismo numero dos veces: fijo son los
-- egresos de rubros con tipo_cupo = 'need' (necesidades), variable el resto. Es el mismo
-- criterio que usa el overload vigente para "gastos de necesidad". Queda anotado para
-- revision del dueno.
CREATE OR REPLACE FUNCTION public.fn_reporte_escudo_tiempo(p_user_id uuid)
 RETURNS TABLE(ingreso_promedio numeric, gasto_fijo_promedio numeric, gasto_variable_promedio numeric, ahorro_neto numeric, dias_escudo integer, calificacion_escudo text, mensaje text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id bigint;
  v_ingreso_prom numeric;
  v_gasto_fijo_prom numeric;
  v_gasto_variable_prom numeric;
  v_ahorro_neto numeric;
  v_dias_escudo integer;
  v_calificacion text;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = p_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom
  FROM v_p_caja_reportable
  WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';

  SELECT COALESCE(SUM(c.valor_egreso), 0) / 6 INTO v_gasto_fijo_prom
  FROM v_p_caja_reportable c
  INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
  WHERE c.user_id = v_user_id AND c.tipo = 'expense'
    AND e.tipo_cupo = 'need'
    AND c.fecha >= CURRENT_DATE - INTERVAL '180 days';

  SELECT COALESCE(SUM(c.valor_egreso), 0) / 6 INTO v_gasto_variable_prom
  FROM v_p_caja_reportable c
  LEFT JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
  WHERE c.user_id = v_user_id AND c.tipo = 'expense'
    AND COALESCE(e.tipo_cupo, '') <> 'need'
    AND c.fecha >= CURRENT_DATE - INTERVAL '180 days';

  v_ahorro_neto := v_ingreso_prom - v_gasto_fijo_prom;

  -- Antes: SELECT fn_dias_escudo(...) INTO v_dias_escudo — helper inexistente.
  v_dias_escudo := CASE
    WHEN (v_gasto_fijo_prom + v_gasto_variable_prom) <= 0 THEN 0
    WHEN v_ahorro_neto <= 0 THEN 0
    ELSE floor(v_ahorro_neto / ((v_gasto_fijo_prom + v_gasto_variable_prom) / 30.0))::int
  END;

  -- Mismo vocabulario que el overload vigente: la UI traduce, la funcion no escribe
  -- texto en ningun idioma.
  IF v_dias_escudo >= 90 THEN
    v_calificacion := 'safe';
  ELSIF v_dias_escudo >= 7 THEN
    v_calificacion := 'warning';
  ELSE
    v_calificacion := 'critical';
  END IF;

  RETURN QUERY SELECT v_ingreso_prom, v_gasto_fijo_prom, v_gasto_variable_prom,
                      v_ahorro_neto, v_dias_escudo, v_calificacion, NULL::text;
END;
$function$;
