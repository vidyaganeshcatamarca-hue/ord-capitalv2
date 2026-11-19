-- Fotografia verificable del estado actual del modulo de presupuesto.
--
-- Solo lectura. Devuelve una sola fila JSON para no romper el limite de la API.
--
-- Para que sirve: el plan aprobado pide una linea base ANTES de tocar nada (etapa 0.3)
-- y no se hizo. Esto no reemplaza esa linea base ni se presenta como tal: es la foto
-- del estado DE DESPUES, para que a partir de aca cualquier cambio sea comparable y
-- para dejar registrado que el punto de partida original no existe.
SELECT json_build_object(
  'tomada_en', now(),
  'nota', 'Fotografia tomada DESPUES de las modificaciones. No es la linea base de la etapa 0.3, que no se hizo.',
  'cuentas', (
    SELECT json_agg(c ORDER BY c.user_id)
    FROM (
      SELECT cfg.user_id,
             cfg.modo_presupuesto,
             cfg.dia_ancla_ciclo,
             cfg.fecha_activacion_base_cero,
             (SELECT count(*) FROM public.p_presupuestos p      WHERE p.user_id  = cfg.user_id) AS filas_presupuesto,
             (SELECT count(*) FROM public.p_presupuestos p      WHERE p.user_id  = cfg.user_id AND p.monto_techo IS NOT NULL) AS filas_con_techo,
             (SELECT count(*) FROM public.p_presupuestos p      WHERE p.user_id  = cfg.user_id AND COALESCE(p.monto_limite,0) <> 0) AS filas_con_plata,
             (SELECT md5(string_agg(p.estructura_egreso_id::text || '|' || p.mes_periodo::text || '|' ||
                                    COALESCE(p.monto_limite,0)::text || '|' || COALESCE(p.monto_techo::text,'nulo') || '|' ||
                                    COALESCE(p.dia_ancla::text,'nulo'), ',' ORDER BY p.estructura_egreso_id, p.mes_periodo))
                FROM public.p_presupuestos p WHERE p.user_id = cfg.user_id) AS md5_presupuestos,
             (SELECT md5(string_agg(h.estructura_egreso_id::text || '|' || h.mes_periodo::text || '|' ||
                                    COALESCE(h.monto_limite,0)::text || '|' || COALESCE(h.monto_techo::text,'nulo') || '|' ||
                                    COALESCE(h.motivo,''), ',' ORDER BY h.historial_id))
                FROM public.p_presupuestos_historial h WHERE h.user_id = cfg.user_id) AS md5_historial,
             (SELECT count(*) FROM public.p_presupuestos_historial h WHERE h.user_id = cfg.user_id) AS filas_historial
        FROM public.p_presupuestos_config cfg
    ) c
  ),
  'totales', json_build_object(
    'cuentas_con_config', (SELECT count(*) FROM public.p_presupuestos_config),
    'filas_presupuesto',  (SELECT count(*) FROM public.p_presupuestos),
    'filas_con_techo',    (SELECT count(*) FROM public.p_presupuestos WHERE monto_techo IS NOT NULL),
    'filas_historial',    (SELECT count(*) FROM public.p_presupuestos_historial),
    'md5_presupuestos',   (SELECT md5(string_agg(p.presupuesto_id::text || '|' || COALESCE(p.user_id::text,'n') || '|' ||
                                                 p.estructura_egreso_id::text || '|' || p.mes_periodo::text || '|' ||
                                                 COALESCE(p.monto_limite,0)::text || '|' || COALESCE(p.monto_techo::text,'nulo'),
                                                 ',' ORDER BY p.presupuesto_id))
                             FROM public.p_presupuestos p)
  ),
  'funciones_instaladas', (
    SELECT json_agg(f ORDER BY f.nombre)
    FROM (
      SELECT p.proname AS nombre,
             pg_get_function_identity_arguments(p.oid) AS firma,
             md5(pg_get_functiondef(p.oid)) AS md5
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (p.proname LIKE '%presupuesto%' OR p.proname LIKE '%sobre%' OR p.proname LIKE '%transferir%'
              OR p.proname LIKE '%techo%' OR p.proname LIKE '%subcuenta%' OR p.proname LIKE '%disponible%'
              OR p.proname LIKE '%arrastre%' OR p.proname LIKE '%saldo_a_asignar%')
    ) f
  )
) AS foto;
