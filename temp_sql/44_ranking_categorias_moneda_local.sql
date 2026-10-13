-- Ranking de categorias en moneda local (opcion B): suma valor_local congelado.
-- Ambas sobrecargas vivas conservan su firma; se agrega la columna meta que las
-- builds viejas de produccion ignoran.
CREATE OR REPLACE FUNCTION public.fn_reporte_ranking_categorias()
 RETURNS TABLE(estructura_id bigint, nombre_cuenta text, icono text, color text, es_padre boolean, nombre_rubro_padre text, total_consumido numeric, utilidad_placer smallint, flexibilidad_recorte smallint, meta jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id int8; v_f_inicio date; v_f_fin date; v_moneda_local text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    RETURN QUERY
    SELECT e.estructura_id, e.nombre_cuenta, e.icono, COALESCE(e.color, padre.color) AS color_final, (e.padre_id IS NULL) AS es_nodo_padre,
           CASE WHEN e.padre_id IS NULL THEN NULL ELSE padre.nombre_cuenta END AS rubro_padre_nombre,
           SUM(COALESCE(c.valor_local, 0)::numeric) AS total_consumido, e.utilidad_placer, e.flexibilidad_recorte,
           jsonb_build_object('moneda_local', v_moneda_local,
                              'sin_cotizacion', COUNT(*) FILTER (WHERE c.valor_local IS NULL))::jsonb AS meta
    FROM public.p_caja c INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
    WHERE c.fecha BETWEEN v_f_inicio AND v_f_fin AND c.tipo = 'expense'
      AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
      AND ((e.padre_id IS NOT NULL) OR (e.padre_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.p_estructuras_egresos hijo WHERE hijo.padre_id = e.estructura_id AND hijo.user_id = e.user_id)))
    GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.color, padre.color, e.padre_id, padre.nombre_cuenta, e.utilidad_placer, e.flexibilidad_recorte
    ORDER BY SUM(COALESCE(c.valor_local, 0)) DESC LIMIT 20;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reporte_ranking_categorias(p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_billetera_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(estructura_id bigint, nombre_cuenta text, icono text, color text, es_padre boolean, nombre_rubro_padre text, total_consumido numeric, utilidad_placer smallint, flexibilidad_recorte smallint, meta jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_hogar_id bigint;
  v_f_inicio date;
  v_fin date;
  v_moneda_local text;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL THEN
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_fin
    FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
  ELSE
    v_f_inicio := p_fecha_inicio;
    v_fin := p_fecha_fin;
  END IF;

  IF v_f_inicio > v_fin THEN
    RAISE EXCEPTION '{"key": "error_invalid_date_range", "params": {}}';
  END IF;

  SELECT hogar_id INTO v_hogar_id
  FROM public.p_hogar_participantes
  WHERE user_id = v_user_id;

  SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
  FROM public.p_config_region r WHERE r.user_id = v_user_id;
  v_moneda_local := COALESCE(v_moneda_local, 'ARS');

  RETURN QUERY
  SELECT
    e.estructura_id,
    e.nombre_cuenta,
    e.icono,
    COALESCE(e.color, padre.color),
    (e.padre_id IS NULL),
    CASE WHEN e.padre_id IS NULL THEN NULL ELSE padre.nombre_cuenta END,
    SUM(COALESCE(c.valor_local, 0)::numeric),
    e.utilidad_placer,
    e.flexibilidad_recorte,
    jsonb_build_object('moneda_local', v_moneda_local,
                       'sin_cotizacion', COUNT(*) FILTER (WHERE c.valor_local IS NULL))::jsonb
  FROM public.p_caja c
  INNER JOIN public.p_estructuras_egresos e
    ON c.estructura_egreso_id = e.estructura_id
  LEFT JOIN public.p_estructuras_egresos padre
    ON e.padre_id = padre.estructura_id
  WHERE c.fecha BETWEEN v_f_inicio AND v_fin
    AND c.tipo = 'expense'
    AND (p_billetera_id IS NULL OR c.billetera_origen_id = p_billetera_id)
    AND (
      (c.user_id = v_user_id AND c.es_compartido = false)
      OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true)
    )
    AND (
      e.padre_id IS NOT NULL
      OR (
        e.padre_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.p_estructuras_egresos hijo
          WHERE hijo.padre_id = e.estructura_id
            AND hijo.user_id = e.user_id
        )
      )
    )
  GROUP BY
    e.estructura_id,
    e.nombre_cuenta,
    e.icono,
    e.color,
    padre.color,
    e.padre_id,
    padre.nombre_cuenta,
    e.utilidad_placer,
    e.flexibilidad_recorte
  ORDER BY SUM(COALESCE(c.valor_local, 0)) DESC
  LIMIT 20;
END;
$function$;