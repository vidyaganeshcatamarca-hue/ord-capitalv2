-- ============================================================================
-- 113 - El clon apaga triggers solo donde hace falta
--
--   Sale de la verificacion independiente de la 110. La 110 envolvio toda la fase de
--   borrado en session_replication_role = replica, y eso apagaba tambien las cascadas:
--   p_pagos_tarjeta_log cuelga de p_caja por ON DELETE CASCADE, asi que al re-clonar
--   quedaban filas huerfanas apuntando a un p_caja inexistente.
--
--   La excepcion se acota al borrado de p_estructuras_egresos, que es el unico bloqueado
--   por fn_tr_bloquear_borrado_categoria_inversion (rechaza tipo_cupo = 'investment').
--
--   Alcance: solo el armado de la fase de borrado. Nada mas cambia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_clonar_usuario_admin(p_user_id_origen bigint, p_destino_user_id bigint DEFAULT 20, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id_destino bigint := p_destino_user_id;
    v_origen record;
    v_destino record;
    v_audit_id bigint;
    v_resultado text;
    v_detalle jsonb;
    -- m\u00e9tricas (se llenan en Task 3)
    v_total_inserts bigint := 0;
    v_total_deletes bigint := 0;
    v_filas_insertadas bigint;
    v_filas_insertadas_padres bigint;
    v_filas_insertadas_hijos bigint;
    v_filas_eliminadas bigint;
    v_borradas_jsonb jsonb;
    v_copiadas_jsonb jsonb;
    v_tabla text;
    v_billetera_rec public.p_billeteras%ROWTYPE;
BEGIN
    -- ============================================================
    -- FASE 0: VALIDACIONES
    -- ============================================================

    -- (a) Permisos: service_role only
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '{"key":"error_admin_only","params":{}}';
    END IF;

    -- (b) Origen existe y no eliminado
    SELECT user_id, nombre, email, deleted_at, auth_id
      INTO v_origen
      FROM public.usuarios
     WHERE user_id = p_user_id_origen;

    IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object('key','error_clone_origen_inexistente','params', jsonb_build_object('user_id', p_user_id_origen))::text;
    END IF;

    IF v_origen.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION '%', jsonb_build_object('key','error_clone_origen_eliminado','params', jsonb_build_object('user_id', p_user_id_origen))::text;
    END IF;

    -- (c) Destino está en whitelist (admin_clone_destinos_permitidos)
    --     Esta es la salvaguarda principal contra errores del agente:
    --     si el caller pasa un user_id que NO está en la whitelist, la RPC
    --     lo rechaza sin tocar nada.
    PERFORM 1 FROM public.admin_clone_destinos_permitidos
     WHERE destino_user_id = v_user_id_destino AND habilitado = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key','error_clone_destino_no_permitido',
            'params', jsonb_build_object('user_id', v_user_id_destino)
        )::text;
    END IF;

    -- (d) Destino existe
    SELECT user_id, nombre, email
      INTO v_destino
      FROM public.usuarios
     WHERE user_id = v_user_id_destino;

    IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object('key','error_clone_destino_inexistente','params', jsonb_build_object('user_id', v_user_id_destino))::text;
    END IF;

    -- (e) Origen distinto de destino
    IF p_user_id_origen = v_user_id_destino THEN
        RAISE EXCEPTION '%', jsonb_build_object('key','error_clone_origen_igual_destino','params', '{}'::jsonb)::text;
    END IF;

    -- (f) Auth.uid del origen vivo
    IF v_origen.auth_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_origen.auth_id) THEN
        RAISE EXCEPTION '%', jsonb_build_object('key','error_clone_origen_sin_auth','params', '{}'::jsonb)::text;
    END IF;

    -- ============================================================
    -- AUDIT: registrar intenci\u00f3n (in_progress) ANTES de cualquier otra cosa
    -- ============================================================
    INSERT INTO public.admin_audit_log (
        accion, admin_caller, origen_user_id, destino_user_id,
        parametros, resultado, detalle
    )
    VALUES (
        'clone_user',
        COALESCE(auth.role(), 'unknown'),
        p_user_id_origen,
        v_user_id_destino,
        jsonb_build_object('origen_nombre', v_origen.nombre, 'destino_nombre', v_destino.nombre),
        'in_progress',
        '{}'::jsonb
    )
    RETURNING audit_id INTO v_audit_id;

    -- ============================================================
    -- DRY_RUN: salir ac\u00e1 con m\u00e9tricas vac\u00edas
    -- ============================================================
    IF p_dry_run THEN
        UPDATE public.admin_audit_log SET
            resultado = 'dry_run',
            detalle = jsonb_build_object('nota', 'dry_run no ejecuta borrado ni copia')
        WHERE audit_id = v_audit_id;

        RETURN jsonb_build_object(
            'ok', true,
            'dry_run', true,
            'origen', jsonb_build_object('user_id', v_origen.user_id, 'nombre', v_origen.nombre, 'email', v_origen.email),
            'destino', jsonb_build_object('user_id', v_destino.user_id, 'nombre', v_destino.nombre, 'email', v_destino.email),
            'ejecutado_at', now(),
            'tablas_borradas', '{}'::jsonb,
            'tablas_copiadas', '{}'::jsonb,
            'filas_insertadas_total', 0,
            'filas_eliminadas_total', 0,
            'audit_id', v_audit_id
        );
    END IF;

-- ============================================================
    -- FASE 1: BORRADO DEL DESTINO (orden hijos → padres)
    -- Se preservan: hogar (grafo entero), preferencias UI, config regional,
    -- historico_score, y la fila de public.usuarios del destino.
    -- ============================================================
    v_borradas_jsonb := '{}'::jsonb;

    -- Fix 2026-10-28 (2/2): el clon tiene que poder correrse dos veces. La fase de
    -- borrado es un reset administrativo del sandbox, pero los triggers de bloqueo la
    -- frenan: fn_tr_bloquear_borrado_categoria_inversion rechaza borrar cualquier
    -- categoria con tipo_cupo = 'investment', y el primer clon copia justamente
    -- cat_investments_portfolio del origen al destino. A partir de ahi todo re-clon
    -- muere con error_category_system_locked y el sandbox queda inservible (paso
    -- realmente, 2026-10-28). Se borra sin triggers; los INSERT de la copia siguen
    -- con la replicacion normal, igual que antes.
    FOR v_tabla IN
        SELECT unnest(ARRAY[
            'p_cuotas_detalle',
            'p_caja',
            'p_prestamos',
            'p_caja_cuarentena',
            'p_compromisos_tarjeta',
            'p_gastos_recurrentes',
            'p_presupuestos',
            'p_estructuras_egresos',
            'p_tarjetas_credito',
            'p_inversiones',
            'p_billeteras',
            'p_presupuestos_config',
            'p_grupo_familiar',
            'p_recordatorios',
            'p_ingresos',
            'p_webhook_queue'
        ])
    LOOP
        -- Fix 2026-10-28 (v2): la excepcion se acota a la unica tabla que la necesita.
        -- Apagar los triggers de toda la fase de borrado tambien apagaba las cascadas
        -- (p_pagos_tarjeta_log cuelga de p_caja por CASCADE y quedaba huerfana al
        -- re-clonar). El unico bloqueo real es
        -- fn_tr_bloquear_borrado_categoria_inversion, que rechaza borrar categorias con
        -- tipo_cupo = 'investment'.
        IF v_tabla = 'p_estructuras_egresos' THEN
            SET LOCAL session_replication_role = replica;
        END IF;

        EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_tabla)
        USING v_user_id_destino;

        IF v_tabla = 'p_estructuras_egresos' THEN
            SET LOCAL session_replication_role = origin;
        END IF;
        GET DIAGNOSTICS v_filas_eliminadas = ROW_COUNT;
        v_total_deletes := v_total_deletes + v_filas_eliminadas;
        v_borradas_jsonb := v_borradas_jsonb || jsonb_build_object(v_tabla, v_filas_eliminadas);
    END LOOP;

    -- p_referidos: el destino es user_id_invitador (salientes) o user_id_invitado (entrantes).
    -- Borrar ambos lados para que el destino quede limpio. Los entrantes son identidad de
    -- otro usuario real (no se pisan al copiar).
    DELETE FROM public.p_referidos
     WHERE user_id_invitador = v_user_id_destino
        OR user_id_invitado = v_user_id_destino;
    GET DIAGNOSTICS v_filas_eliminadas = ROW_COUNT;
    v_total_deletes := v_total_deletes + v_filas_eliminadas;
    v_borradas_jsonb := v_borradas_jsonb || jsonb_build_object('p_referidos', v_filas_eliminadas);

    -- ============================================================
    -- FASE 2: UPDATE public.usuarios destino (preservar identidad/auth)
    -- NO se tocan: user_id, nombre, email, password, login, auth_id,
    -- deleted_at, estado_cuenta, creado_at, ultimo_login.
    -- Se pisan TODAS las demás columnas con valores del origen.
    -- ============================================================
    UPDATE public.usuarios SET
        telefono                   = (SELECT telefono FROM public.usuarios WHERE user_id = p_user_id_origen),
        documento                  = (SELECT documento FROM public.usuarios WHERE user_id = p_user_id_origen),
        razon_social               = (SELECT razon_social FROM public.usuarios WHERE user_id = p_user_id_origen),
        tipo_producto              = (SELECT tipo_producto FROM public.usuarios WHERE user_id = p_user_id_origen),
        valor_entrega              = (SELECT valor_entrega FROM public.usuarios WHERE user_id = p_user_id_origen),
        valor_mensual_contratado   = (SELECT valor_mensual_contratado FROM public.usuarios WHERE user_id = p_user_id_origen),
        mes_ultimo_pago            = (SELECT mes_ultimo_pago FROM public.usuarios WHERE user_id = p_user_id_origen),
        tipo_sistema               = (SELECT tipo_sistema FROM public.usuarios WHERE user_id = p_user_id_origen),
        vendedor_app_id            = (SELECT vendedor_app_id FROM public.usuarios WHERE user_id = p_user_id_origen),
        asignado_vendedor_at       = (SELECT asignado_vendedor_at FROM public.usuarios WHERE user_id = p_user_id_origen),
        app_version                = (SELECT app_version FROM public.usuarios WHERE user_id = p_user_id_origen),
        modo_app                   = (SELECT modo_app FROM public.usuarios WHERE user_id = p_user_id_origen),
        total_usage_seconds        = COALESCE((SELECT total_usage_seconds FROM public.usuarios WHERE user_id = p_user_id_origen), 0),
        last_session_at            = (SELECT last_session_at FROM public.usuarios WHERE user_id = p_user_id_origen)
    WHERE user_id = v_user_id_destino;

    -- ============================================================
    -- FASE 3: COPIA CON REMAPEO (orden topológico)
    -- Mapas temporales OLD → NEW. ON COMMIT DROP garantiza limpieza
    -- ante ROLLBACK (la transacción cubre toda la RPC).
    -- ============================================================
    v_copiadas_jsonb := '{}'::jsonb;

    CREATE TEMP TABLE _map_estructuras (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _map_billeteras  (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _map_tarjetas    (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _map_caja        (old_id bigint PRIMARY KEY, new_id bigint NOT NULL) ON COMMIT DROP;

    -- ------------------------------------------------------------
    -- 3.1 p_presupuestos_config (1 fila esperada)
    -- ------------------------------------------------------------
    INSERT INTO public.p_presupuestos_config (user_id, modo_presupuesto, porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo, dia_ancla_ciclo, fecha_activacion_base_cero)
    SELECT v_user_id_destino, modo_presupuesto, porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo, dia_ancla_ciclo, fecha_activacion_base_cero
      FROM public.p_presupuestos_config
     WHERE user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_presupuestos_config', v_filas_insertadas);

    -- ------------------------------------------------------------
    -- 3.2 p_grupo_familiar
    -- ------------------------------------------------------------
    INSERT INTO public.p_grupo_familiar (user_id, nombre, creado_at)
    SELECT v_user_id_destino, nombre, creado_at
      FROM public.p_grupo_familiar
     WHERE user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_grupo_familiar', v_filas_insertadas);

    -- ------------------------------------------------------------
    -- 3.3 p_billeteras (saldo_actual=0 — se recalcula en FASE 4 con p_caja)
    -- IMPORTANTE: emparejamiento por NOMBRE, no por row_number().
    -- El row_number emparejaba por orden de PK, lo que era incorrecto
    -- porque origen y destino tienen PKs en secuencias independientes.
    -- Aqui asumimos que `nombre` es único por user_id (verificado al
    -- disenar la RPC; si en el futuro hay billeteras con nombre duplicado
    -- por usuario, se necesitara un discriminador adicional).
    -- ------------------------------------------------------------
    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa, es_compartida, ultima_conciliacion_at, es_fondo_prevision, monto_meta, fecha_objetivo, billetera_respaldo_id, es_cuenta_madre_ahorro, icono, saldo_inicial_pendiente)
    SELECT v_user_id_destino, nombre, moneda, 0, activa, es_compartida, NULL, es_fondo_prevision, monto_meta, fecha_objetivo, billetera_respaldo_id, es_cuenta_madre_ahorro, icono, saldo_inicial_pendiente
      FROM public.p_billeteras
     WHERE user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_billeteras', v_filas_insertadas);

    -- Mapa OLD → NEW: emparejar por nombre
    INSERT INTO _map_billeteras (old_id, new_id)
    SELECT o.billetera_id AS old_id, d.billetera_id AS new_id
      FROM public.p_billeteras o
      JOIN public.p_billeteras d ON d.user_id = v_user_id_destino AND d.nombre = o.nombre
     WHERE o.user_id = p_user_id_origen;

    -- ------------------------------------------------------------
    -- 3.4 p_estructuras_egresos PADRES (padre_id IS NULL)
    -- Emparejamiento por nombre_cuenta (entre padres: nombre único por user).
    -- ------------------------------------------------------------
    INSERT INTO public.p_estructuras_egresos (user_id, padre_id, nombre_cuenta, descripcion, tipo_cupo, hogar_id, icono, color, es_deseo, es_hormiga, definicion_hormiga, utilidad_placer, flexibilidad_recorte, creado_at)
    SELECT v_user_id_destino, NULL, nombre_cuenta, descripcion, tipo_cupo, NULL, icono, color, es_deseo, es_hormiga, definicion_hormiga, utilidad_placer, flexibilidad_recorte, creado_at
      FROM public.p_estructuras_egresos
     WHERE user_id = p_user_id_origen AND padre_id IS NULL;
    GET DIAGNOSTICS v_filas_insertadas_padres = ROW_COUNT;

    -- Mapa padres: emparejar por nombre (son únicos por user)
    INSERT INTO _map_estructuras (old_id, new_id)
    SELECT o.estructura_id AS old_id, d.estructura_id AS new_id
      FROM public.p_estructuras_egresos o
      JOIN public.p_estructuras_egresos d
        ON d.user_id = v_user_id_destino
       AND d.padre_id IS NULL
       AND d.nombre_cuenta = o.nombre_cuenta
     WHERE o.user_id = p_user_id_origen AND o.padre_id IS NULL;

    -- ------------------------------------------------------------
    -- 3.5 p_estructuras_egresos HIJOS
    -- Emparejamiento: cada hijo (origen) matchea con su contraparte (destino)
    -- por (nombre_cuenta, padre del destino matchea con padre del origen via mapa).
    -- Estrategia: el padre del hijo destino se setea al new_id del padre
    -- ya mapeado. Para el mapa OLD→NEW del hijo, emparejamos por
    -- (nombre_cuenta, padre_id_new_id_via_mapa). Como el padre del hijo
    -- destino es el new_id del padre origen, usamos la posicion en el
    -- subquery del JOIN con _map_estructuras.
    -- ------------------------------------------------------------
    INSERT INTO public.p_estructuras_egresos (user_id, padre_id, nombre_cuenta, descripcion, tipo_cupo, hogar_id, icono, color, es_deseo, es_hormiga, definicion_hormiga, utilidad_placer, flexibilidad_recorte, creado_at)
    SELECT v_user_id_destino, m.new_id, e.nombre_cuenta, e.descripcion, e.tipo_cupo, NULL, e.icono, e.color, e.es_deseo, e.es_hormiga, e.definicion_hormiga, e.utilidad_placer, e.flexibilidad_recorte, e.creado_at
      FROM public.p_estructuras_egresos e
      JOIN _map_estructuras m ON m.old_id = e.padre_id
     WHERE e.user_id = p_user_id_origen AND e.padre_id IS NOT NULL;
    GET DIAGNOSTICS v_filas_insertadas_hijos = ROW_COUNT;

    -- Mapa hijos: emparejar por (nombre_cuenta, padre_id) donde padre_id
    -- del destino es el new_id del padre del origen via el mapa.
    -- O sea: el hijo origen tiene (nombre, padre_old), el hijo destino
    -- tiene (nombre, new_id_del_padre). Hacemos JOIN indirecto.
    INSERT INTO _map_estructuras (old_id, new_id)
    SELECT o.estructura_id AS old_id, d.estructura_id AS new_id
      FROM public.p_estructuras_egresos o
      JOIN _map_estructuras m_padre_origen
        ON m_padre_origen.old_id = o.padre_id
      JOIN public.p_estructuras_egresos d
        ON d.user_id = v_user_id_destino
       AND d.padre_id = m_padre_origen.new_id
       AND d.nombre_cuenta = o.nombre_cuenta
     WHERE o.user_id = p_user_id_origen AND o.padre_id IS NOT NULL
    ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id;

    SELECT count(*) INTO v_filas_insertadas FROM public.p_estructuras_egresos WHERE user_id = v_user_id_destino;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_estructuras_egresos', jsonb_build_object('total', v_filas_insertadas, 'padres', v_filas_insertadas_padres, 'hijos', v_filas_insertadas_hijos));

    -- ------------------------------------------------------------
    -- 3.6 p_tarjetas_credito
    -- ------------------------------------------------------------
    INSERT INTO public.p_tarjetas_credito (user_id, nombre_tarjeta, dia_cierre, dia_vencimiento, limite_un_pago, limite_cuotas, moneda_iso, banco, color, activa, recargo_dolar_pct, saldo_a_favor)
    SELECT v_user_id_destino, nombre_tarjeta, dia_cierre, dia_vencimiento, limite_un_pago, limite_cuotas, moneda_iso, banco, color, activa, recargo_dolar_pct, saldo_a_favor
      FROM public.p_tarjetas_credito
     WHERE user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_tarjetas_credito', v_filas_insertadas);

    -- Fix 2026-10-28 (1/2): el mapa de tarjetas se arma por IDENTIDAD (nombre + ciclo),
    -- no por posicion. Con row_number() OVER (ORDER BY tarjeta_id) el orden fisico del
    -- destino -que depende de como salio el INSERT de arriba, que no tiene ORDER BY- no
    -- coincide con el orden de id del origen. Resultado medido en un clon 30 -> 20: 4 de
    -- 5 tarjetas cruzadas (AMEX -> MC BNA, MC BNA -> MC UALA, VISA BNA -> AMEX, MC UALA ->
    -- VISA BNA), y con ellas las cuotas, los compromisos y las compras de cada tarjeta.
    -- Las 34 cuotas de MC BNA terminaron en la tarjeta llamada MC UALA, con el ciclo de
    -- UALA (30/7) en vez del suyo (24/4): el sandbox deja de reproducir el escenario.
    -- Un clon que cruza datos en silencio es peor que uno que falla.
    --
    -- El destino acaba de recibir copias exactas de las tarjetas del origen (fase 3.6,
    -- sobre el destino ya vaciado en fase 2), asi que nombre + cierre + vencimiento
    -- siempre empareja. row_number() particionado por esa identidad resuelve las
    -- tarjetas homonimas de forma determinista.
    INSERT INTO _map_tarjetas (old_id, new_id)
    SELECT src.tarjeta_id, dst.tarjeta_id
      FROM (SELECT tarjeta_id, nombre_tarjeta, dia_cierre, dia_vencimiento,
                   row_number() OVER (PARTITION BY nombre_tarjeta, dia_cierre, dia_vencimiento
                                      ORDER BY tarjeta_id) AS rn
              FROM public.p_tarjetas_credito WHERE user_id = p_user_id_origen) src
      JOIN (SELECT tarjeta_id, nombre_tarjeta, dia_cierre, dia_vencimiento,
                   row_number() OVER (PARTITION BY nombre_tarjeta, dia_cierre, dia_vencimiento
                                      ORDER BY tarjeta_id) AS rn
              FROM public.p_tarjetas_credito WHERE user_id = v_user_id_destino) dst
        ON  dst.nombre_tarjeta   IS NOT DISTINCT FROM src.nombre_tarjeta
       AND  dst.dia_cierre      IS NOT DISTINCT FROM src.dia_cierre
       AND  dst.dia_vencimiento IS NOT DISTINCT FROM src.dia_vencimiento
       AND  dst.rn              = src.rn;

    -- Si alguna tarjeta del origen se quedo sin mapear, el clon falla ruidosamente en
    -- vez de copiar sus cuotas sin tarjeta.
    IF (SELECT count(*) FROM _map_tarjetas)
       <> (SELECT count(*) FROM public.p_tarjetas_credito WHERE user_id = p_user_id_origen) THEN
        RAISE EXCEPTION '{"key":"error_clone_mapeo_tarjetas","params":{}}';
    END IF;

    -- ============================================================
    -- 3.7 p_inversiones (con remapeo billetera_origen_id)
    -- ============================================================
    INSERT INTO public.p_inversiones (user_id, nombre_activo, monto_invertido_original, billetera_origen_id, fecha_inicio, estado, monto_liquidado, fecha_liquidacion, moneda, tasa_anual_tna, valor_mercado_actual, ultima_conciliacion)
    SELECT v_user_id_destino, i.nombre_activo, i.monto_invertido_original, mb.new_id, i.fecha_inicio, i.estado, i.monto_liquidado, i.fecha_liquidacion, i.moneda, i.tasa_anual_tna, i.valor_mercado_actual, i.ultima_conciliacion
      FROM public.p_inversiones i
      LEFT JOIN _map_billeteras mb ON mb.old_id = i.billetera_origen_id
     WHERE i.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_inversiones', v_filas_insertadas);

    -- ============================================================
    -- 3.8 p_caja_cuarentena (con remapeo billetera_id y estructura_egreso_id)
    -- ============================================================
    INSERT INTO public.p_caja_cuarentena (user_id, origen, recurrente_id, billetera_id, estructura_egreso_id, monto, fecha, detalle, metadata, estado, creado_at)
    SELECT v_user_id_destino, cc.origen, cc.recurrente_id, mb.new_id, me.new_id, cc.monto, cc.fecha, cc.detalle, cc.metadata, cc.estado, cc.creado_at
      FROM public.p_caja_cuarentena cc
      LEFT JOIN _map_billeteras mb ON mb.old_id = cc.billetera_id
      LEFT JOIN _map_estructuras me ON me.old_id = cc.estructura_egreso_id
     WHERE cc.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_caja_cuarentena', v_filas_insertadas);

    -- ============================================================
    -- 3.9 p_caja 1ra pasada: INSERT con FKs simples (tarjeta_id NULL por ahora)
    -- familiar_id, hogar_id, proyecto_id, pagado_por_user_id quedan NULL (decision D7).
    -- ============================================================
    INSERT INTO public.p_caja (user_id, fecha, tipo, cuenta_ingreso_id, billetera_origen_id, billetera_destino_id, nombre_cuenta_historico, valor_egreso, valor_ingreso, observaciones, metadata, creado_at, familiar_id, tarjeta_id, cuotas_totales, es_usd, hogar_id, es_compartido, pagado_por_user_id, proyecto_id, en_balance_activo, porcentaje_creador_snapshot, porcentaje_invitado_snapshot, detalle, estructura_egreso_id)
    SELECT v_user_id_destino, c.fecha, c.tipo, NULL, mbo.new_id, mbd.new_id, c.nombre_cuenta_historico, c.valor_egreso, c.valor_ingreso, c.observaciones, c.metadata, c.creado_at, NULL, NULL, c.cuotas_totales, c.es_usd, NULL, c.es_compartido, NULL, NULL, c.en_balance_activo, c.porcentaje_creador_snapshot, c.porcentaje_invitado_snapshot, c.detalle, me.new_id
      FROM public.p_caja c
      LEFT JOIN _map_billeteras mbo ON mbo.old_id = c.billetera_origen_id
      LEFT JOIN _map_billeteras mbd ON mbd.old_id = c.billetera_destino_id
      LEFT JOIN _map_estructuras me ON me.old_id = c.estructura_egreso_id
     WHERE c.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_caja_1ra_pasada', v_filas_insertadas);

    -- Mapa OLD → NEW para p_caja
    INSERT INTO _map_caja (old_id, new_id)
    SELECT src.p_caja_id AS old_id, dst.p_caja_id AS new_id
      FROM (SELECT p_caja_id, row_number() OVER (ORDER BY p_caja_id) AS rn FROM public.p_caja WHERE user_id = p_user_id_origen) src
      JOIN (SELECT p_caja_id, row_number() OVER (ORDER BY p_caja_id) AS rn FROM public.p_caja WHERE user_id = v_user_id_destino) dst
        ON src.rn = dst.rn;

    -- ============================================================
    -- 3.10 p_cuotas_detalle (con remapeo p_caja_id y tarjeta_id)
    -- ============================================================
    INSERT INTO public.p_cuotas_detalle (user_id, tarjeta_id, prestamo_id, p_caja_id, numero_cuota, monto_cuota, fecha_estimada_pago, pagado, creado_at)
    SELECT v_user_id_destino, mt.new_id, NULL, mc.new_id, cd.numero_cuota, cd.monto_cuota, cd.fecha_estimada_pago, cd.pagado, cd.creado_at
      FROM public.p_cuotas_detalle cd
      LEFT JOIN _map_tarjetas mt ON mt.old_id = cd.tarjeta_id
      LEFT JOIN _map_caja mc ON mc.old_id = cd.p_caja_id
     WHERE cd.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_cuotas_detalle', v_filas_insertadas);

    -- ============================================================
    -- 3.11 p_prestamos (con remapeo p_caja_id)
    -- ============================================================
    INSERT INTO public.p_prestamos (user_id, entidad_nombre, tipo_entidad, tipo_flujo, monto_total_deuda, monto_pagado_acumulado, moneda_iso, estado, p_caja_id, nombre_prestamo, tipo_deuda, saldo_actual, tasa_anual_tna, cuota_mensual, proximo_vencimiento, monto_original)
    SELECT v_user_id_destino, p.entidad_nombre, p.tipo_entidad, p.tipo_flujo, p.monto_total_deuda, p.monto_pagado_acumulado, p.moneda_iso, p.estado, mc.new_id, p.nombre_prestamo, p.tipo_deuda, p.saldo_actual, p.tasa_anual_tna, p.cuota_mensual, p.proximo_vencimiento, p.monto_original
      FROM public.p_prestamos p
      LEFT JOIN _map_caja mc ON mc.old_id = p.p_caja_id
     WHERE p.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_prestamos', v_filas_insertadas);

    -- ============================================================
    -- 3.12 p_compromisos_tarjeta (con remapeo tarjeta_id)
    -- ============================================================
    INSERT INTO public.p_compromisos_tarjeta (user_id, tarjeta_id, monto_cuota, mes_periodo, pagado, creado_at)
    SELECT v_user_id_destino, mt.new_id, ct.monto_cuota, ct.mes_periodo, ct.pagado, ct.creado_at
      FROM public.p_compromisos_tarjeta ct
      JOIN _map_tarjetas mt ON mt.old_id = ct.tarjeta_id
     WHERE ct.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_compromisos_tarjeta', v_filas_insertadas);

    -- ============================================================
    -- 3.13 p_presupuestos (con remapeo estructura_egreso_id, hogar_id NULL)
    -- ============================================================
    INSERT INTO public.p_presupuestos (user_id, hogar_id, monto_limite, mes_periodo, estructura_egreso_id, dia_ancla)
    SELECT v_user_id_destino, NULL, p.monto_limite, p.mes_periodo, me.new_id, p.dia_ancla
      FROM public.p_presupuestos p
      JOIN _map_estructuras me ON me.old_id = p.estructura_egreso_id
     WHERE p.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_presupuestos', v_filas_insertadas);

    -- ============================================================
    -- 3.14 p_gastos_recurrentes (con remapeo estructura_egreso_id, billetera_defecto_id)
    -- ============================================================
    INSERT INTO public.p_gastos_recurrentes (user_id, estructura_egreso_id, nombre_custom, monto_base, dia_del_mes, frecuencia, tipo_variabilidad, billetera_defecto_id, activo, creado_at)
    SELECT v_user_id_destino, me.new_id, gr.nombre_custom, gr.monto_base, gr.dia_del_mes, gr.frecuencia, gr.tipo_variabilidad, mb.new_id, gr.activo, gr.creado_at
      FROM public.p_gastos_recurrentes gr
      LEFT JOIN _map_estructuras me ON me.old_id = gr.estructura_egreso_id
      LEFT JOIN _map_billeteras mb ON mb.old_id = gr.billetera_defecto_id
     WHERE gr.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_gastos_recurrentes', v_filas_insertadas);

    -- ============================================================
    -- 3.15 p_caja 2da pasada: UPDATE tarjeta_id (remapeo)
    -- ============================================================
    UPDATE public.p_caja dest
       SET tarjeta_id = mt.new_id
      FROM public.p_caja orig, _map_caja mc, _map_tarjetas mt
     WHERE dest.user_id = v_user_id_destino
       AND mc.new_id = dest.p_caja_id
       AND orig.p_caja_id = mc.old_id
       AND orig.tarjeta_id = mt.old_id;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_caja_2da_pasada_tarjeta_id', v_filas_insertadas);

    -- ============================================================
    -- 3.16 p_recordatorios
    -- ============================================================
    INSERT INTO public.p_recordatorios (user_id, titulo, descripcion, hora, dias_semana, recurrente, fecha_unica, activo, created_at)
    SELECT v_user_id_destino, r.titulo, r.descripcion, r.hora, r.dias_semana, r.recurrente, r.fecha_unica, r.activo, r.created_at
      FROM public.p_recordatorios r
     WHERE r.user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_recordatorios', v_filas_insertadas);

    -- ============================================================
    -- 3.17 p_referidos SOLO SALIENTES (user_id_invitador = origen)
    -- ============================================================
    INSERT INTO public.p_referidos (user_id_invitador, user_id_invitado, email_invitado, codigo_referido, creado_at, usado_at, beneficio_aplicado, fecha_suscripcion, suscrito_premium, completado_onboarding)
    SELECT v_user_id_destino, ref.user_id_invitado, ref.email_invitado, ref.codigo_referido, ref.creado_at, ref.usado_at, ref.beneficio_aplicado, ref.fecha_suscripcion, ref.suscrito_premium, ref.completado_onboarding
      FROM public.p_referidos ref
     WHERE ref.user_id_invitador = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_referidos_salientes', v_filas_insertadas);

    -- ============================================================
    -- 3.18 p_ingresos (fuentes de ingreso — catálogo del usuario)
    -- Emparejamiento por nombre (la columna 'nombre' es unica por user
    -- en la practica; si en el futuro hay duplicados, se necesitara un
    -- discriminador adicional como 'descripcion').
    -- No tiene FKs salientes (solo user_id -> usuarios) y no hay tablas
    -- que apunten a producto_id, asi que no requiere _map_ingresos.
    -- ============================================================
    INSERT INTO public.p_ingresos (user_id, nombre, descripcion, icono, color, es_pasivo)
    SELECT v_user_id_destino, nombre, descripcion, icono, color, es_pasivo
      FROM public.p_ingresos
     WHERE user_id = p_user_id_origen;
    GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
    v_total_inserts := v_total_inserts + v_filas_insertadas;
    v_copiadas_jsonb := v_copiadas_jsonb || jsonb_build_object('p_ingresos', v_filas_insertadas);

    -- ============================================================
    -- FASE 4: RECALCULAR SALDOS DEL DESTINO
    -- fn_recalcular_saldos_billeteras() afecta a TODO el sistema, no la usamos.
    -- Calculamos manualmente solo para el destino con la misma logica.
    -- ============================================================
    FOR v_billetera_rec IN
        SELECT * FROM public.p_billeteras WHERE user_id = v_user_id_destino
    LOOP
        SELECT COALESCE(SUM(
            CASE
                WHEN tipo IN ('income', 'opening') THEN valor_ingreso
                WHEN tipo = 'adjustment' THEN (valor_ingreso - valor_egreso)
                WHEN tipo = 'expense' THEN -valor_egreso
                WHEN tipo = 'transfer' AND billetera_origen_id = v_billetera_rec.billetera_id THEN -valor_egreso
                WHEN tipo = 'transfer' AND billetera_destino_id = v_billetera_rec.billetera_id THEN valor_egreso
                ELSE 0
            END
        ), 0)
          INTO v_filas_insertadas
          FROM public.p_caja
         WHERE user_id = v_user_id_destino
           AND (billetera_origen_id = v_billetera_rec.billetera_id
                OR (tipo = 'transfer' AND billetera_destino_id = v_billetera_rec.billetera_id));

        UPDATE public.p_billeteras
           SET saldo_actual = v_filas_insertadas
         WHERE billetera_id = v_billetera_rec.billetera_id;
    END LOOP;
    v_resultado := 'ok';
    v_detalle := jsonb_build_object(
        'task', '3c',
        'filas_eliminadas_total', v_total_deletes,
        'filas_insertadas_total', v_total_inserts,
        'tablas_borradas', v_borradas_jsonb,
        'tablas_copiadas', v_copiadas_jsonb,
        'nota', 'Clone completo: borrado + UPDATE usuarios + copia de todas las tablas + recálculo de saldos.'
    );

    UPDATE public.admin_audit_log SET
        resultado = v_resultado,
        detalle = v_detalle
    WHERE audit_id = v_audit_id;

    RETURN jsonb_build_object(
        'ok', true,
        'dry_run', false,
        'origen', jsonb_build_object('user_id', v_origen.user_id, 'nombre', v_origen.nombre, 'email', v_origen.email),
        'destino', jsonb_build_object('user_id', v_destino.user_id, 'nombre', v_destino.nombre, 'email', v_destino.email),
        'ejecutado_at', now(),
        'tablas_borradas', v_borradas_jsonb,
        'tablas_copiadas', v_copiadas_jsonb,
        'filas_insertadas_total', v_total_inserts,
        'filas_eliminadas_total', v_total_deletes,
        'audit_id', v_audit_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Si llegamos ac\u00e1 DESPU\u00c9S de insertar audit_id, actualizar a 'error'.
    IF v_audit_id IS NOT NULL THEN
        UPDATE public.admin_audit_log SET
            resultado = 'error',
            detalle = jsonb_build_object(
                'sqlstate', SQLSTATE,
                'errmsg', SQLERRM,
                'tabla_fallida', COALESCE(v_tabla, 'desconocida')
            )
        WHERE audit_id = v_audit_id;
    END IF;
    RAISE;
END;
$function$;
