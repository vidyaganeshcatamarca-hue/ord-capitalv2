CREATE OR REPLACE FUNCTION public.fn_reporte_movimientos_recientes(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_filtro_tipo text DEFAULT 'all', p_billetera_id bigint DEFAULT NULL::bigint, p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(p_caja_id bigint, fecha date, tipo text, monto numeric, moneda text, nombre_categoria text, icono_categoria text, color_categoria text, nombre_billetera text, detalle text, es_compartido boolean, pagado_por text, billetera_origen_id bigint, billetera_destino_id bigint, estructura_egreso_id bigint, cuenta_ingreso_id bigint, observaciones text, tarjeta_id bigint, cuotas_totales integer, padre_id bigint, nombre_rubro_padre text, color_rubro_padre text, es_usd boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_hogar_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  IF p_fecha_inicio IS NOT NULL AND p_fecha_fin IS NOT NULL AND p_fecha_inicio > p_fecha_fin THEN
    RAISE EXCEPTION '{"key": "error_invalid_date_range", "params": {}}';
  END IF;

  SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

  RETURN QUERY
  SELECT
    c.p_caja_id,
    c.fecha,
    c.tipo,
    CASE
      WHEN c.tipo IN ('income', 'opening') THEN c.valor_ingreso
      WHEN c.tipo IN ('expense', 'pago_tarjeta') THEN -c.valor_egreso
      WHEN c.tipo = 'transfer' THEN c.valor_egreso
      WHEN c.tipo = 'adjustment' THEN CASE WHEN c.valor_ingreso > 0 THEN c.valor_ingreso ELSE -c.valor_egreso END
      ELSE 0
    END::numeric AS monto,
    CASE WHEN c.es_usd THEN 'USD' ELSE c.moneda END::text AS moneda,
    CASE
      WHEN c.detalle = 'adjustment_card_diff' THEN 'cat_card_diff'
      ELSE COALESCE(e.nombre_cuenta, i.nombre,
        CASE c.tipo
          WHEN 'income' THEN 'type_income'
          WHEN 'opening' THEN 'type_opening'
          WHEN 'transfer' THEN 'type_transfer'
          WHEN 'pago_tarjeta' THEN 'type_card_payment'
          WHEN 'adjustment' THEN CASE WHEN c.valor_ingreso > 0 THEN 'type_adjustment_surplus' ELSE 'type_adjustment_mystery' END
          ELSE 'no_category'
        END
      )
    END::text AS nombre_categoria,
    COALESCE(e.icono, i.icono, CASE c.tipo WHEN 'pago_tarjeta' THEN 'credit-card' ELSE NULL END)::text AS icono_categoria,
    COALESCE(e.color, i.color, CASE c.tipo WHEN 'pago_tarjeta' THEN '#8b5cf6' ELSE NULL END)::text AS color_categoria,
    COALESCE(b.nombre, tc.nombre_tarjeta)::text AS nombre_billetera,
    c.detalle,
    c.es_compartido,
    u.nombre::text,
    c.billetera_origen_id,
    c.billetera_destino_id,
    c.estructura_egreso_id,
    c.cuenta_ingreso_id,
    c.observaciones,
    c.tarjeta_id,
    c.cuotas_totales,
    p.estructura_id AS padre_id,
    p.nombre_cuenta::text AS nombre_rubro_padre,
    p.color::text AS color_rubro_padre,
    c.es_usd
  FROM public.p_caja c
  LEFT JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
  LEFT JOIN public.p_estructuras_egresos p ON e.padre_id = p.estructura_id
  LEFT JOIN public.p_ingresos i ON c.cuenta_ingreso_id = i.producto_id
  LEFT JOIN public.p_billeteras b ON c.billetera_origen_id = b.billetera_id
  LEFT JOIN public.p_tarjetas_credito tc ON c.tarjeta_id = tc.tarjeta_id
  LEFT JOIN public.usuarios u ON c.pagado_por_user_id = u.user_id
  WHERE ((c.user_id = v_user_id AND c.es_compartido = false)
      OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
    AND (p_filtro_tipo = 'all' OR c.tipo = p_filtro_tipo)
    AND (p_billetera_id IS NULL OR c.billetera_origen_id = p_billetera_id)
    -- Cuando el usuario filtra por una tarjeta, excluimos el pago del resumen
    -- (que sale desde la billetera, no de la tarjeta).
    AND (p_tarjeta_id IS NULL OR (c.tarjeta_id = p_tarjeta_id AND c.tipo <> 'pago_tarjeta'))
    AND (p_fecha_inicio IS NULL OR c.fecha >= p_fecha_inicio)
    AND (p_fecha_fin IS NULL OR c.fecha <= p_fecha_fin)
  ORDER BY c.fecha DESC, c.p_caja_id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$