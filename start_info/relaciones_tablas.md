# Relaciones y estructura de tablas

<!-- GENERADO AUTOMATICAMENTE. No editar a mano.
     Origen: catalogo desplegado, proyecto bjszdmheddcxjdhcvibi.
     Generador: scripts/prestamos/dump-schema.mjs
     Tablas: 74
     Solo estructura. Sin datos, sin credenciales. -->

Regenerar con: `node scripts/prestamos/dump-schema.mjs`

## `admin_audit_log`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `audit_id` | bigint |  | NO | nextval('admin_audit_log_audit_id_seq'::regclass) |
| 2 | `accion` | text |  | NO |  |
| 3 | `admin_caller` | text |  | YES |  |
| 4 | `origen_user_id` | bigint |  | YES |  |
| 5 | `destino_user_id` | bigint |  | YES |  |
| 6 | `parametros` | jsonb |  | NO | '{}'::jsonb |
| 7 | `resultado` | text |  | NO |  |
| 8 | `detalle` | jsonb |  | NO | '{}'::jsonb |
| 9 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `PK` admin_audit_log_pkey: PRIMARY KEY (audit_id)

## `admin_clone_destinos_permitidos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `destino_user_id` | bigint |  | NO |  |
| 2 | `descripcion` | text |  | NO |  |
| 3 | `habilitado` | boolean |  | NO | true |
| 4 | `agregado_en` | timestamp with time zone |  | NO | now() |
| 5 | `agregado_por` | text |  | YES |  |

**Restricciones**

- `PK` admin_clone_destinos_permitidos_pkey: PRIMARY KEY (destino_user_id)

## `admin_usuarios`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `admin_id` | bigint |  | NO |  |
| 2 | `auth_id` | uuid |  | NO |  |
| 3 | `email` | text |  | NO |  |
| 4 | `rol` | text |  | NO | 'viewer'::text |
| 5 | `habilitado` | boolean |  | NO | true |
| 6 | `creado_at` | timestamp with time zone |  | NO | now() |
| 7 | `ultimo_acceso_at` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` admin_usuarios_rol_check: CHECK ((rol = ANY (ARRAY['viewer'::text, 'admin'::text])))
- `PK` admin_usuarios_pkey: PRIMARY KEY (admin_id)
- `UNIQUE` admin_usuarios_auth_id_key: UNIQUE (auth_id)
- `UNIQUE` admin_usuarios_email_key: UNIQUE (email)

## `app_feature_flags`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `feature_key` | text |  | NO |  |
| 2 | `modo_minimo` | text |  | NO |  |
| 3 | `descripcion` | text |  | YES |  |
| 4 | `activo` | boolean |  | YES | true |
| 5 | `orden` | integer |  | YES | 0 |
| 6 | `pref_key` | text |  | YES |  |
| 7 | `activo_testing` | boolean |  | NO | true |

**Restricciones**

- `CHECK` app_feature_flags_modo_minimo_check: CHECK ((modo_minimo = ANY (ARRAY['simple'::text, 'intermedio'::text, 'avanzado'::text])))
- `PK` app_feature_flags_pkey: PRIMARY KEY (feature_key)

## `app_global_config`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `clave` | text |  | NO |  |
| 2 | `valor` | text |  | NO |  |
| 3 | `descripcion` | text |  | YES |  |

**Restricciones**

- `PK` app_global_config_pkey: PRIMARY KEY (clave)

## `app_reportes`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `reporte_id` | bigint |  | NO | nextval('app_reportes_reporte_id_seq'::regclass) |
| 2 | `usuario_id` | bigint |  | NO |  |
| 3 | `titulo` | character varying(150) | 150 | NO |  |
| 4 | `descripcion` | text |  | YES |  |
| 5 | `transcripcion_audio` | text |  | YES |  |
| 6 | `tiene_audio` | boolean |  | NO | false |
| 7 | `media` | jsonb |  | NO | '[]'::jsonb |
| 8 | `pantalla` | text |  | YES |  |
| 9 | `version_app` | text |  | YES |  |
| 10 | `plataforma` | text |  | YES |  |
| 11 | `estado` | text |  | NO | 'nuevo'::text |
| 12 | `respuesta_admin` | text |  | YES |  |
| 13 | `creado_el` | timestamp with time zone |  | NO | now() |
| 14 | `tipo` | text |  | NO | 'bug'::text |
| 15 | `idioma_origen` | text |  | YES |  |
| 16 | `texto_original` | text |  | YES |  |
| 17 | `tuvo_adjuntos` | boolean |  | NO | false |
| 18 | `explicacion_interna` | text |  | YES |  |

**Restricciones**

- `CHECK` app_reportes_estado_check: CHECK ((estado = ANY (ARRAY['nuevo'::text, 'en_revision'::text, 'resuelto'::text, 'descartado'::text])))
- `CHECK` app_reportes_tipo_check: CHECK ((tipo = ANY (ARRAY['bug'::text, 'sugerencia'::text])))
- `CHECK` ck_reportes_titulo_len: CHECK ((char_length(TRIM(BOTH FROM titulo)) <= 150))
- `PK` app_reportes_pkey: PRIMARY KEY (reporte_id)

## `app_usuario_bloqueos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `bloqueo_id` | bigint |  | NO | nextval('app_usuario_bloqueos_bloqueo_id_seq'::regclass) |
| 2 | `usuario_id` | bigint |  | NO |  |
| 3 | `feature_key` | text |  | NO |  |
| 4 | `activo` | boolean |  | NO | true |
| 5 | `motivo` | text |  | YES |  |
| 6 | `creado_el` | timestamp with time zone |  | NO | now() |
| 7 | `hasta` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` app_usuario_bloqueos_feature_key_check: CHECK ((feature_key = ANY (ARRAY['menu_carga_voz'::text, 'menu_ocr'::text])))
- `CHECK` app_usuario_bloqueos_hasta_check: CHECK (((hasta IS NULL) OR (hasta > now())))
- `FK` fk_bloqueos_usuario: FOREIGN KEY (usuario_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` app_usuario_bloqueos_pkey: PRIMARY KEY (bloqueo_id)

## `caja`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `caja_id` | bigint |  | NO |  |
| 3 | `fecha` | date |  | NO |  |
| 4 | `tipo` | text |  | NO |  |
| 5 | `cuenta_egreso_id` | bigint |  | YES |  |
| 6 | `producto_id` | bigint |  | YES |  |
| 7 | `vendedor_id` | bigint |  | YES |  |
| 8 | `nombre_cuenta_historico` | text |  | YES |  |
| 9 | `valor_egreso` | integer |  | YES | 0 |
| 10 | `valor_ingreso` | integer |  | YES | 0 |
| 12 | `ajuste` | integer |  | YES | 0 |
| 14 | `margen_unitario` | integer |  | YES | 0 |
| 15 | `nombre_cliente` | text |  | YES |  |
| 16 | `observaciones` | text |  | YES |  |
| 17 | `creado_at` | timestamp with time zone |  | NO | now() |
| 18 | `valor_contratado` | integer |  | YES | 0 |
| 21 | `user_id` | bigint |  | NO |  |
| 23 | `valor_real` | integer |  | YES |  |

**Restricciones**

- `CHECK` caja_tipo_check: CHECK ((tipo = ANY (ARRAY['income'::text, 'expense'::text])))
- `FK` caja_cuenta_egreso_id_fkey: FOREIGN KEY (cuenta_egreso_id) REFERENCES cuentas_egresos(cuenta_id) ON DELETE SET NULL
- `FK` caja_cuenta_ingreso_id_fkey: FOREIGN KEY (producto_id) REFERENCES productos(producto_id) ON DELETE SET NULL
- `FK` caja_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` caja_vendedor_id_fkey: FOREIGN KEY (vendedor_id) REFERENCES vendedores(vendedor_id) ON DELETE SET NULL
- `PK` caja_pkey: PRIMARY KEY (caja_id)

## `cuentas_egresos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `cuenta_id` | bigint |  | NO |  |
| 3 | `nombre_cuenta` | text |  | NO |  |
| 4 | `descripcion` | text |  | YES |  |
| 5 | `tipo` | text |  | NO |  |
| 6 | `creado_at` | timestamp with time zone |  | NO | now() |
| 8 | `user_id` | bigint |  | NO |  |
| 9 | `cost_type` | text |  | YES | 'fixed'::text |

**Restricciones**

- `CHECK` chk_cuentas_egresos_cost_type: CHECK ((cost_type = ANY (ARRAY['fixed'::text, 'product'::text])))
- `CHECK` cuentas_egresos_tipo_check: CHECK ((tipo = ANY (ARRAY['costo_fijo'::text, 'costo_producto'::text])))
- `FK` cuentas_egresos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` cuentas_egresos_pkey: PRIMARY KEY (cuenta_id)

## `legal_document_version`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `doc_type` | text |  | NO |  |
| 2 | `version` | text |  | NO |  |
| 3 | `requires_acceptance` | boolean |  | NO | false |
| 4 | `requires_notification` | boolean |  | NO | false |
| 5 | `effective_at` | timestamp with time zone |  | NO | now() |
| 6 | `created_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` legal_document_version_doc_type_check: CHECK ((doc_type = ANY (ARRAY['terminos'::text, 'privacidad'::text])))
- `PK` legal_document_version_pkey: PRIMARY KEY (doc_type, version)

## `p_app_sessions`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `session_id` | uuid |  | NO | gen_random_uuid() |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `platform` | text |  | NO | 'web'::text |
| 4 | `app_version` | text |  | YES |  |
| 5 | `started_at` | timestamp with time zone |  | NO | now() |
| 6 | `ended_at` | timestamp with time zone |  | YES |  |
| 7 | `paused_at` | timestamp with time zone |  | YES |  |
| 8 | `total_active_seconds` | integer |  | NO | 0 |
| 9 | `status` | text |  | NO | 'active'::text |
| 10 | `metadata` | jsonb |  | YES | '{}'::jsonb |
| 11 | `created_at` | timestamp with time zone |  | NO | now() |
| 12 | `updated_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_app_sessions_status_check: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'crashed'::text, 'posible_crash'::text])))
- `FK` p_app_sessions_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_app_sessions_pkey: PRIMARY KEY (session_id)

## `p_app_version_policy`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `id` | bigint |  | NO |  |
| 2 | `min_required_version` | text |  | NO |  |
| 3 | `latest_version` | text |  | NO |  |
| 4 | `mandatory` | boolean |  | NO | false |
| 5 | `descripcion` | text |  | YES |  |
| 6 | `effective_at` | timestamp with time zone |  | NO | now() |
| 7 | `notes` | text |  | YES |  |
| 8 | `created_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `PK` p_app_version_policy_pkey: PRIMARY KEY (id)

## `p_billeteras`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `billetera_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `nombre` | text |  | NO |  |
| 4 | `moneda` | text |  | YES | 'ARS'::text |
| 5 | `saldo_actual` | numeric |  | YES | 0 |
| 6 | `activa` | boolean |  | YES | true |
| 7 | `es_compartida` | boolean |  | YES | false |
| 8 | `ultima_conciliacion_at` | timestamp with time zone |  | YES |  |
| 9 | `es_fondo_prevision` | boolean |  | YES | false |
| 10 | `monto_meta` | numeric |  | YES | 0 |
| 11 | `fecha_objetivo` | date |  | YES |  |
| 12 | `billetera_respaldo_id` | bigint |  | YES |  |
| 13 | `es_cuenta_madre_ahorro` | boolean |  | YES | false |
| 14 | `icono` | text |  | YES | '💵'::text |
| 15 | `saldo_inicial_pendiente` | boolean |  | NO | false |

**Restricciones**

- `FK` p_billeteras_billetera_respaldo_id_fkey: FOREIGN KEY (billetera_respaldo_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_billeteras_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_billeteras_pkey: PRIMARY KEY (billetera_id)

## `p_caja`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `p_caja_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `fecha` | date |  | NO |  |
| 4 | `tipo` | text |  | NO |  |
| 6 | `cuenta_ingreso_id` | bigint |  | YES |  |
| 7 | `billetera_origen_id` | bigint |  | YES |  |
| 8 | `billetera_destino_id` | bigint |  | YES |  |
| 9 | `nombre_cuenta_historico` | text |  | YES |  |
| 10 | `valor_egreso` | numeric |  | YES | 0 |
| 11 | `valor_ingreso` | numeric |  | YES | 0 |
| 12 | `observaciones` | text |  | YES |  |
| 13 | `metadata` | jsonb |  | YES | '{}'::jsonb |
| 14 | `creado_at` | timestamp with time zone |  | YES | now() |
| 17 | `familiar_id` | bigint |  | YES |  |
| 18 | `tarjeta_id` | bigint |  | YES |  |
| 19 | `cuotas_totales` | integer |  | YES | 1 |
| 20 | `es_usd` | boolean |  | YES | false |
| 21 | `hogar_id` | bigint |  | YES |  |
| 22 | `es_compartido` | boolean |  | YES | false |
| 23 | `pagado_por_user_id` | bigint |  | YES |  |
| 24 | `proyecto_id` | bigint |  | YES |  |
| 25 | `en_balance_activo` | boolean |  | YES | true |
| 26 | `porcentaje_creador_snapshot` | numeric |  | YES |  |
| 27 | `porcentaje_invitado_snapshot` | numeric |  | YES |  |
| 28 | `detalle` | text |  | YES |  |
| 29 | `estructura_egreso_id` | bigint |  | YES |  |
| 30 | `moneda` | text |  | NO | 'ARS'::text |
| 31 | `parent_pago_caja_id` | bigint |  | YES |  |
| 32 | `resumen_real` | numeric |  | YES |  |
| 33 | `valor_local` | numeric |  | YES |  |
| 34 | `moneda_local` | text |  | YES |  |
| 35 | `tasa_snapshot` | numeric |  | YES |  |

**Restricciones**

- `CHECK` p_caja_tipo_check: CHECK ((tipo = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text, 'adjustment'::text, 'opening'::text, 'pago_tarjeta'::text])))
- `FK` p_caja_billetera_destino_id_fkey: FOREIGN KEY (billetera_destino_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_caja_billetera_origen_id_fkey: FOREIGN KEY (billetera_origen_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_caja_cuenta_ingreso_id_fkey: FOREIGN KEY (cuenta_ingreso_id) REFERENCES p_ingresos(producto_id) ON DELETE SET NULL
- `FK` p_caja_estructura_egreso_id_fkey: FOREIGN KEY (estructura_egreso_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_caja_familiar_id_fkey: FOREIGN KEY (familiar_id) REFERENCES p_grupo_familiar(familiar_id) ON DELETE CASCADE
- `FK` p_caja_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_caja_pagado_por_user_id_fkey: FOREIGN KEY (pagado_por_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` p_caja_proyecto_id_fkey: FOREIGN KEY (proyecto_id) REFERENCES p_proyectos_compartidos(proyecto_id) ON DELETE CASCADE
- `FK` p_caja_tarjeta_id_fkey: FOREIGN KEY (tarjeta_id) REFERENCES p_tarjetas_credito(tarjeta_id) ON DELETE SET NULL
- `FK` p_caja_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_caja_pkey: PRIMARY KEY (p_caja_id)

## `p_caja_cuarentena`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `pendiente_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `origen` | text |  | NO |  |
| 4 | `recurrente_id` | bigint |  | YES |  |
| 5 | `billetera_id` | bigint |  | YES |  |
| 6 | `estructura_egreso_id` | bigint |  | YES |  |
| 7 | `monto` | numeric |  | NO |  |
| 8 | `fecha` | date |  | NO | CURRENT_DATE |
| 9 | `detalle` | text |  | YES |  |
| 10 | `metadata` | jsonb |  | YES | '{}'::jsonb |
| 11 | `estado` | text |  | NO | 'pendiente'::text |
| 12 | `creado_at` | timestamp with time zone |  | YES | now() |
| 13 | `tipo` | text |  | YES |  |
| 14 | `billetera_destino_id` | bigint |  | YES |  |
| 15 | `tarjeta_id` | bigint |  | YES |  |
| 16 | `cuenta_ingreso_id` | bigint |  | YES |  |
| 17 | `moneda` | text |  | YES |  |
| 18 | `cuotas` | integer |  | YES |  |
| 19 | `destination_amount` | numeric |  | YES |  |

**Restricciones**

- `CHECK` p_caja_cuarentena_cuotas_check: CHECK (((cuotas IS NULL) OR (cuotas > 0)))
- `CHECK` p_caja_cuarentena_destination_amount_check: CHECK (((destination_amount IS NULL) OR (destination_amount > (0)::numeric)))
- `CHECK` p_caja_cuarentena_estado_check: CHECK ((estado = ANY (ARRAY['pendiente'::text, 'procesado'::text, 'rechazado'::text])))
- `CHECK` p_caja_cuarentena_moneda_check: CHECK (((moneda IS NULL) OR (moneda ~ '^[A-Z]{3}$'::text)))
- `CHECK` p_caja_cuarentena_origen_check: CHECK ((origen = ANY (ARRAY['recurrente'::text, 'ocr'::text, 'voz'::text])))
- `CHECK` p_caja_cuarentena_tipo_check: CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY['expense'::text, 'income'::text, 'transfer'::text, 'card_expense'::text]))))
- `FK` p_caja_cuarentena_billetera_destino_id_fkey: FOREIGN KEY (billetera_destino_id) REFERENCES p_billeteras(billetera_id)
- `FK` p_caja_cuarentena_billetera_id_fkey: FOREIGN KEY (billetera_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_caja_cuarentena_cuenta_ingreso_id_fkey: FOREIGN KEY (cuenta_ingreso_id) REFERENCES p_ingresos(producto_id)
- `FK` p_caja_cuarentena_estructura_egreso_id_fkey: FOREIGN KEY (estructura_egreso_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_caja_cuarentena_recurrente_id_fkey: FOREIGN KEY (recurrente_id) REFERENCES p_gastos_recurrentes(recurrente_id) ON DELETE CASCADE
- `FK` p_caja_cuarentena_tarjeta_id_fkey: FOREIGN KEY (tarjeta_id) REFERENCES p_tarjetas_credito(tarjeta_id)
- `FK` p_caja_cuarentena_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_caja_cuarentena_pkey: PRIMARY KEY (pendiente_id)

## `p_compromisos_tarjeta`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `compromiso_id` | bigint |  | NO |  |
| 2 | `tarjeta_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | NO |  |
| 4 | `monto_cuota` | numeric |  | NO |  |
| 5 | `mes_periodo` | date |  | NO |  |
| 6 | `pagado` | boolean |  | YES | false |
| 7 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_compromisos_tarjeta_tarjeta_id_fkey: FOREIGN KEY (tarjeta_id) REFERENCES p_tarjetas_credito(tarjeta_id) ON DELETE CASCADE
- `FK` p_compromisos_tarjeta_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_compromisos_tarjeta_pkey: PRIMARY KEY (compromiso_id)
- `UNIQUE` unique_tarjeta_mes_user_compromiso: UNIQUE (tarjeta_id, mes_periodo, user_id)

## `p_conciliaciones`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `conciliacion_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `billetera_id` | bigint |  | YES |  |
| 4 | `fecha` | timestamp with time zone |  | YES | now() |
| 5 | `saldo_teorico` | numeric |  | NO |  |
| 6 | `saldo_real` | numeric |  | NO |  |
| 7 | `diferencia` | numeric |  | YES |  |

**Restricciones**

- `FK` p_conciliaciones_billetera_id_fkey: FOREIGN KEY (billetera_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_conciliaciones_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_conciliaciones_pkey: PRIMARY KEY (conciliacion_id)

## `p_config_bola_nieve`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `config_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `estrategia_activa` | text |  | NO | 'math'::text |
| 4 | `fecha_inicio_plan` | date |  | NO | CURRENT_DATE |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |
| 6 | `actualizado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `CHECK` chk_estrategia_activa: CHECK ((estrategia_activa = ANY (ARRAY['math'::text, 'emotional'::text, 'relationships'::text])))
- `FK` p_config_bola_nieve_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_config_bola_nieve_pkey: PRIMARY KEY (config_id)
- `UNIQUE` uq_config_bola_nieve_user: UNIQUE (user_id)

## `p_config_inflacion`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `pais` | text |  | YES |  |
| 3 | `fuente_inflacion` | text |  | YES |  |
| 6 | `inflacion_acumulada_6m` | numeric |  | YES |  |
| 7 | `inflacion_acumulada_12m` | numeric |  | YES |  |
| 8 | `creado_at` | timestamp without time zone |  | YES | now() |
| 9 | `actualizado_at` | timestamp without time zone |  | YES | now() |
| 10 | `p_inflacion_manual_anual_pct` | numeric |  | YES |  |

**Restricciones**

- `CHECK` p_config_inflacion_fuente_inflacion_check: CHECK ((fuente_inflacion = ANY (ARRAY['proxy_dolar'::text, 'manual'::text, 'desactivado'::text])))
- `FK` p_config_inflacion_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_config_inflacion_pkey: PRIMARY KEY (user_id)

## `p_config_region`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `pais_codigo` | text |  | YES |  |
| 3 | `moneda_default` | text |  | YES |  |
| 4 | `idioma_default` | text |  | NO | 'es'::text |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |
| 6 | `origen_pais` | text |  | YES |  |
| 7 | `confirmado_at` | timestamp with time zone |  | YES |  |
| 8 | `monedas_extra` | jsonb |  | NO | '["USD"]'::jsonb |
| 9 | `monedas_formateo` | jsonb |  | NO | '{}'::jsonb |

**Restricciones**

- `CHECK` p_config_region_origen_pais_chk: CHECK (((origen_pais IS NULL) OR (origen_pais = ANY (ARRAY['locale'::text, 'ip'::text, 'manual'::text]))))
- `FK` p_config_region_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_config_region_pkey: PRIMARY KEY (user_id)

## `p_cotizaciones_historico`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `cotizacion_id` | bigint |  | NO |  |
| 2 | `fecha` | date |  | NO |  |
| 3 | `moneda_iso` | text |  | NO |  |
| 4 | `valor_por_usd` | numeric |  | NO |  |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `PK` p_cotizaciones_historico_pkey: PRIMARY KEY (cotizacion_id)
- `UNIQUE` p_cotizaciones_historico_fecha_moneda_iso_key: UNIQUE (fecha, moneda_iso)

## `p_cuotas_detalle`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `cuota_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `tarjeta_id` | bigint |  | YES |  |
| 4 | `prestamo_id` | bigint |  | YES |  |
| 5 | `p_caja_id` | bigint |  | YES |  |
| 6 | `numero_cuota` | integer |  | NO |  |
| 7 | `monto_cuota` | numeric |  | NO |  |
| 8 | `fecha_estimada_pago` | date |  | NO |  |
| 9 | `pagado` | boolean |  | YES | false |
| 10 | `creado_at` | timestamp with time zone |  | YES | now() |
| 11 | `moneda` | text |  | NO | 'ARS'::text |
| 12 | `descripcion` | text |  | YES |  |
| 13 | `estructura_egreso_id` | bigint |  | YES |  |
| 14 | `carga_id` | bigint |  | YES |  |
| 15 | `pago_caja_id` | bigint |  | YES |  |

**Restricciones**

- `FK` p_cuotas_detalle_p_caja_id_fkey: FOREIGN KEY (p_caja_id) REFERENCES p_caja(p_caja_id) ON DELETE CASCADE
- `FK` p_cuotas_detalle_pago_caja_fkey: FOREIGN KEY (pago_caja_id) REFERENCES p_caja(p_caja_id) ON DELETE SET NULL
- `FK` p_cuotas_detalle_prestamo_id_fkey: FOREIGN KEY (prestamo_id) REFERENCES p_prestamos(prestamo_id) ON DELETE CASCADE
- `FK` p_cuotas_detalle_tarjeta_id_fkey: FOREIGN KEY (tarjeta_id) REFERENCES p_tarjetas_credito(tarjeta_id) ON DELETE CASCADE
- `FK` p_cuotas_detalle_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_cuotas_detalle_pkey: PRIMARY KEY (cuota_id)

## `p_divisas`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `divisa_id` | bigint |  | NO |  |
| 2 | `nombre` | text |  | NO |  |
| 3 | `valor_por_usd` | numeric |  | NO |  |
| 4 | `ultima_actualizacion` | timestamp with time zone |  | YES | now() |
| 5 | `valor_anterior` | numeric |  | YES |  |
| 6 | `variacion_mensual_pct` | numeric |  | YES |  |

**Restricciones**

- `PK` p_divisas_pkey: PRIMARY KEY (divisa_id)
- `UNIQUE` uq_divisa_nombre: UNIQUE (nombre)

## `p_estructuras_egresos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `estructura_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `padre_id` | bigint |  | YES |  |
| 4 | `nombre_cuenta` | text |  | NO |  |
| 5 | `descripcion` | text |  | YES |  |
| 6 | `tipo_cupo` | text |  | YES |  |
| 7 | `hogar_id` | bigint |  | YES |  |
| 8 | `icono` | text |  | YES | '🔹'::text |
| 9 | `color` | text |  | YES | '#64748B'::text |
| 10 | `es_deseo` | boolean |  | YES | false |
| 11 | `es_hormiga` | boolean |  | YES | false |
| 12 | `definicion_hormiga` | text |  | YES |  |
| 13 | `utilidad_placer` | smallint |  | YES | 5 |
| 14 | `flexibilidad_recorte` | smallint |  | YES | 5 |
| 15 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_estructuras_egresos_flexibilidad_recorte_check: CHECK (((flexibilidad_recorte >= 1) AND (flexibilidad_recorte <= 10)))
- `CHECK` p_estructuras_egresos_tipo_cupo_check: CHECK ((tipo_cupo = ANY (ARRAY['need'::text, 'want'::text, 'tithe'::text, 'investment'::text, 'saving'::text])))
- `CHECK` p_estructuras_egresos_utilidad_placer_check: CHECK (((utilidad_placer >= 1) AND (utilidad_placer <= 10)))
- `FK` p_estructuras_egresos_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_estructuras_egresos_padre_id_fkey: FOREIGN KEY (padre_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_estructuras_egresos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_estructuras_egresos_pkey: PRIMARY KEY (estructura_id)

## `p_feedback_usuario`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `feedback_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `tipo` | text |  | NO |  |
| 4 | `mensaje` | text |  | NO |  |
| 5 | `metadata` | jsonb |  | YES | '{}'::jsonb |
| 6 | `estado` | text |  | YES | 'nuevo'::text |
| 7 | `respuesta_admin` | text |  | YES |  |
| 8 | `creado_at` | timestamp with time zone |  | YES | now() |
| 9 | `resuelto_at` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` p_feedback_usuario_estado_check: CHECK ((estado = ANY (ARRAY['nuevo'::text, 'en_revision'::text, 'resuelto'::text, 'descartado'::text])))
- `CHECK` p_feedback_usuario_tipo_check: CHECK ((tipo = ANY (ARRAY['bug'::text, 'sugerencia'::text, 'consulta'::text])))
- `FK` p_feedback_usuario_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_feedback_usuario_pkey: PRIMARY KEY (feedback_id)

## `p_gastos_fijos_config`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `config_id` | bigint |  | NO | nextval('p_gastos_fijos_config_config_id_seq'::regclass) |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `estructura_egreso_id` | bigint |  | NO |  |
| 4 | `monto_mensual` | numeric |  | NO | 0 |
| 5 | `es_fijo` | boolean |  | NO | true |
| 6 | `created_at` | timestamp with time zone |  | NO | now() |
| 7 | `updated_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `FK` p_gastos_fijos_config_estructura_egreso_id_fkey: FOREIGN KEY (estructura_egreso_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_gastos_fijos_config_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_gastos_fijos_config_pkey: PRIMARY KEY (config_id)
- `UNIQUE` p_gastos_fijos_config_user_id_estructura_egreso_id_key: UNIQUE (user_id, estructura_egreso_id)

## `p_gastos_recurrentes`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `recurrente_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `estructura_egreso_id` | bigint |  | YES |  |
| 4 | `nombre_custom` | text |  | YES |  |
| 5 | `monto_base` | numeric |  | YES | 0 |
| 6 | `dia_del_mes` | integer |  | YES |  |
| 7 | `frecuencia` | text |  | NO | 'mensual'::text |
| 8 | `tipo_variabilidad` | text |  | NO | 'fijo'::text |
| 9 | `billetera_defecto_id` | bigint |  | YES |  |
| 10 | `activo` | boolean |  | YES | true |
| 11 | `creado_at` | timestamp with time zone |  | YES | now() |
| 12 | `modo` | text |  | NO | 'mensual'::text |
| 13 | `dias_semana` | ARRAY |  | YES |  |
| 14 | `dias_mes` | ARRAY |  | YES |  |
| 15 | `fechas_anio` | ARRAY |  | YES |  |
| 16 | `motivo_pausa` | text |  | YES |  |
| 17 | `pausado_at` | timestamp with time zone |  | YES |  |
| 18 | `fecha_unica` | date |  | YES |  |
| 19 | `fecha_fin` | date |  | YES |  |
| 20 | `tarjeta_id` | bigint |  | YES |  |
| 21 | `es_usd` | boolean |  | NO | false |
| 22 | `proxima_ocurrencia` | date |  | YES |  |
| 23 | `naturaleza` | text |  | NO | 'egreso'::text |
| 24 | `estructura_ingreso_id` | bigint |  | YES |  |
| 25 | `billetera_destino_id` | bigint |  | YES |  |

**Restricciones**

- `CHECK` p_gastos_recurrentes_dia_del_mes_check: CHECK (((dia_del_mes >= 1) AND (dia_del_mes <= 31)))
- `CHECK` p_gastos_recurrentes_dias_rango_check: CHECK ((((dias_semana IS NULL) OR (dias_semana <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])) AND ((dias_mes IS NULL) OR (dias_mes <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint, (17)::smallint, (18)::smallint, (19)::smallint, (20)::smallint, (21)::smallint, (22)::smallint, (23)::smallint, (24)::smallint, (25)::smallint, (26)::smallint, (27)::smallint, (28)::smallint, (29)::smallint, (30)::smallint, (31)::smallint])) AND ((fechas_anio IS NULL) OR (fechas_anio <@ '{101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,427,428,429,430,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,521,522,523,524,525,526,527,528,529,530,531,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,628,629,630,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,717,718,719,720,721,722,723,724,725,726,727,728,729,730,731,801,802,803,804,805,806,807,808,809,810,811,812,813,814,815,816,817,818,819,820,821,822,823,824,825,826,827,828,829,830,831,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,929,930,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016,1017,1018,1019,1020,1021,1022,1023,1024,1025,1026,1027,1028,1029,1030,1031,1101,1102,1103,1104,1105,1106,1107,1108,1109,1110,1111,1112,1113,1114,1115,1116,1117,1118,1119,1120,1121,1122,1123,1124,1125,1126,1127,1128,1129,1130,1201,1202,1203,1204,1205,1206,1207,1208,1209,1210,1211,1212,1213,1214,1215,1216,1217,1218,1219,1220,1221,1222,1223,1224,1225,1226,1227,1228,1229,1230,1231}'::smallint[]))))
- `CHECK` p_gastos_recurrentes_forma_check: CHECK ((((modo = 'semanal'::text) AND (dias_semana IS NOT NULL) AND ((cardinality(dias_semana) >= 1) AND (cardinality(dias_semana) <= 7)) AND (dias_mes IS NULL) AND (fechas_anio IS NULL) AND (fecha_unica IS NULL)) OR ((modo = 'mensual'::text) AND (dias_mes IS NULL) AND ((dia_del_mes >= 1) AND (dia_del_mes <= 31)) AND (dias_semana IS NULL) AND (fechas_anio IS NULL) AND (fecha_unica IS NULL)) OR ((modo = 'mensual'::text) AND (dias_mes IS NOT NULL) AND ((cardinality(dias_mes) >= 1) AND (cardinality(dias_mes) <= 31)) AND (dias_semana IS NULL) AND (fechas_anio IS NULL) AND (fecha_unica IS NULL)) OR ((modo = 'mensual'::text) AND (tarjeta_id IS NOT NULL) AND (dias_mes IS NULL) AND (dia_del_mes IS NULL) AND (dias_semana IS NULL) AND (fechas_anio IS NULL) AND (fecha_unica IS NULL)) OR ((modo = 'anual'::text) AND (fechas_anio IS NOT NULL) AND (cardinality(fechas_anio) >= 1) AND (dias_semana IS NULL) AND (dias_mes IS NULL) AND (fecha_unica IS NULL)) OR ((modo = 'unica'::text) AND (fecha_unica IS NOT NULL) AND (dias_semana IS NULL) AND (dias_mes IS NULL) AND (fechas_anio IS NULL))))
- `CHECK` p_gastos_recurrentes_frecuencia_check: CHECK ((frecuencia = ANY (ARRAY['mensual'::text, 'anual'::text])))
- `CHECK` p_gastos_recurrentes_modo_check: CHECK ((modo = ANY (ARRAY['semanal'::text, 'mensual'::text, 'anual'::text, 'unica'::text])))
- `CHECK` p_gastos_recurrentes_motivo_check: CHECK (((motivo_pausa IS NULL) OR (motivo_pausa = ANY (ARRAY['pausado_por_usuario'::text, 'billetera_eliminada'::text, 'categoria_movida'::text, 'subcuenta_creada'::text, 'vencida'::text, 'tarjeta_eliminada'::text]))))
- `CHECK` p_gastos_recurrentes_naturaleza_chk: CHECK ((naturaleza = ANY (ARRAY['egreso'::text, 'ingreso'::text])))
- `CHECK` p_gastos_recurrentes_naturaleza_origen_chk: CHECK ((((naturaleza = 'ingreso'::text) AND (estructura_egreso_id IS NULL) AND (billetera_defecto_id IS NULL) AND (tarjeta_id IS NULL) AND (COALESCE(es_usd, false) = false) AND (billetera_destino_id IS NOT NULL)) OR ((naturaleza = 'egreso'::text) AND (estructura_ingreso_id IS NULL) AND (billetera_destino_id IS NULL))))
- `CHECK` p_gastos_recurrentes_origen_check: CHECK (((NOT ((billetera_defecto_id IS NOT NULL) AND (tarjeta_id IS NOT NULL))) AND ((es_usd IS FALSE) OR (tarjeta_id IS NOT NULL)) AND ((tarjeta_id IS NULL) OR (modo = 'mensual'::text))))
- `CHECK` p_gastos_recurrentes_tipo_variabilidad_check: CHECK ((tipo_variabilidad = ANY (ARRAY['fijo'::text, 'promedio_historico'::text])))
- `CHECK` p_gastos_recurrentes_vigencia_check: CHECK (((fecha_fin IS NULL) OR (fecha_unica IS NULL) OR (fecha_fin >= fecha_unica)))
- `FK` p_gastos_recurrentes_billetera_defecto_id_fkey: FOREIGN KEY (billetera_defecto_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_gastos_recurrentes_billetera_destino_fk: FOREIGN KEY (billetera_destino_id) REFERENCES p_billeteras(billetera_id)
- `FK` p_gastos_recurrentes_estructura_egreso_id_fkey: FOREIGN KEY (estructura_egreso_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_gastos_recurrentes_estructura_ingreso_fk: FOREIGN KEY (estructura_ingreso_id) REFERENCES p_ingresos(producto_id)
- `FK` p_gastos_recurrentes_tarjeta_id_fkey: FOREIGN KEY (tarjeta_id) REFERENCES p_tarjetas_credito(tarjeta_id) ON DELETE SET NULL
- `FK` p_gastos_recurrentes_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_gastos_recurrentes_pkey: PRIMARY KEY (recurrente_id)

## `p_grupo_familiar`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `familiar_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `nombre` | text |  | NO |  |
| 4 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_grupo_familiar_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_grupo_familiar_pkey: PRIMARY KEY (familiar_id)
- `UNIQUE` p_grupo_familiar_user_id_nombre_key: UNIQUE (user_id, nombre)

## `p_historico_score_salud`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `fecha` | date |  | NO |  |
| 3 | `score_global` | integer |  | YES |  |
| 4 | `score_proteccion` | integer |  | YES |  |
| 5 | `score_presupuesto` | integer |  | YES |  |
| 6 | `score_deuda` | integer |  | YES |  |
| 7 | `score_crecimiento` | integer |  | YES |  |
| 8 | `score_ahorro` | integer |  | YES |  |
| 9 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_historico_score_salud_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_historico_score_salud_pkey: PRIMARY KEY (user_id, fecha)

## `p_hogar_conciliaciones`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `conciliacion_id` | bigint |  | NO |  |
| 2 | `hogar_id` | bigint |  | NO |  |
| 3 | `creado_por_user_id` | bigint |  | NO |  |
| 4 | `tipo` | text |  | NO |  |
| 5 | `monto_saldado` | numeric |  | NO | 0 |
| 6 | `direccion` | text |  | YES |  |
| 7 | `billetera_origen_id` | bigint |  | YES |  |
| 8 | `billetera_destino_id` | bigint |  | YES |  |
| 9 | `nota` | text |  | YES |  |
| 10 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `CHECK` p_hogar_conciliaciones_direccion_check: CHECK ((direccion = ANY (ARRAY['creador_a_invitado'::text, 'invitado_a_creador'::text, 'ninguna'::text])))
- `CHECK` p_hogar_conciliaciones_tipo_check: CHECK ((tipo = ANY (ARRAY['transferencia_real'::text, 'marcar_saldado'::text, 'disolucion'::text])))
- `FK` p_hogar_conciliaciones_billetera_destino_id_fkey: FOREIGN KEY (billetera_destino_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_hogar_conciliaciones_billetera_origen_id_fkey: FOREIGN KEY (billetera_origen_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_hogar_conciliaciones_creado_por_user_id_fkey: FOREIGN KEY (creado_por_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` p_hogar_conciliaciones_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `PK` p_hogar_conciliaciones_pkey: PRIMARY KEY (conciliacion_id)

## `p_hogar_invitaciones`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `invitacion_id` | bigint |  | NO |  |
| 2 | `hogar_id` | bigint |  | NO |  |
| 3 | `codigo` | text |  | NO |  |
| 4 | `creado_por_user_id` | bigint |  | NO |  |
| 5 | `expira_at` | timestamp with time zone |  | NO |  |
| 6 | `usada` | boolean |  | YES | false |
| 7 | `usada_por_user_id` | bigint |  | YES |  |
| 8 | `creada_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_hogar_invitaciones_creado_por_user_id_fkey: FOREIGN KEY (creado_por_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` p_hogar_invitaciones_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_hogar_invitaciones_usada_por_user_id_fkey: FOREIGN KEY (usada_por_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_hogar_invitaciones_pkey: PRIMARY KEY (invitacion_id)
- `UNIQUE` p_hogar_invitaciones_codigo_key: UNIQUE (codigo)

## `p_hogar_pagos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `pago_id` | bigint |  | NO |  |
| 2 | `hogar_id` | bigint |  | YES |  |
| 3 | `de_user_id` | bigint |  | YES |  |
| 4 | `para_user_id` | bigint |  | YES |  |
| 5 | `monto` | numeric |  | NO |  |
| 6 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `CHECK` p_hogar_pagos_monto_check: CHECK ((monto > (0)::numeric))
- `FK` p_hogar_pagos_de_user_id_fkey: FOREIGN KEY (de_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` p_hogar_pagos_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_hogar_pagos_para_user_id_fkey: FOREIGN KEY (para_user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_hogar_pagos_pkey: PRIMARY KEY (pago_id)

## `p_hogar_participantes`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `hogar_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `rol` | text |  | YES |  |

**Restricciones**

- `CHECK` p_hogar_participantes_rol_check: CHECK ((rol = ANY (ARRAY['creador'::text, 'invitado'::text])))
- `FK` p_hogar_participantes_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_hogar_participantes_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_hogar_participantes_pkey: PRIMARY KEY (hogar_id, user_id)

## `p_hogares`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `hogar_id` | bigint |  | NO |  |
| 2 | `nombre_hogar` | text |  | YES | 'Nuestro Hogar'::text |
| 3 | `porcentaje_usuario_creador` | numeric |  | YES | 50.00 |
| 4 | `porcentaje_usuario_invitado` | numeric |  | YES | 50.00 |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |
| 6 | `codigo_invitacion` | text |  | YES |  |

**Restricciones**

- `PK` p_hogares_pkey: PRIMARY KEY (hogar_id)
- `UNIQUE` p_hogares_codigo_invitacion_key: UNIQUE (codigo_invitacion)

## `p_ia_global_mapping`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `mapping_id` | bigint |  | NO |  |
| 2 | `termino_clave` | text |  | NO |  |
| 3 | `rubro_nombre` | text |  | NO |  |
| 4 | `subcuenta_nombre` | text |  | NO |  |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `PK` p_ia_global_mapping_pkey: PRIMARY KEY (mapping_id)
- `UNIQUE` p_ia_global_mapping_termino_clave_key: UNIQUE (termino_clave)

## `p_ia_global_suggestions`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `suggestion_id` | bigint |  | NO |  |
| 2 | `termino_clave` | text |  | NO |  |
| 3 | `rubro_id` | bigint |  | YES |  |
| 4 | `subcuenta_id` | bigint |  | YES |  |
| 5 | `usuario_que_sugirio` | bigint |  | YES |  |
| 6 | `votos_coincidentes` | integer |  | YES | 1 |
| 7 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_ia_global_suggestions_usuario_que_sugirio_fkey: FOREIGN KEY (usuario_que_sugirio) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_ia_global_suggestions_pkey: PRIMARY KEY (suggestion_id)
- `UNIQUE` p_ia_global_suggestions_termino_clave_rubro_id_subcuenta_id_key: UNIQUE (termino_clave, rubro_id, subcuenta_id)

## `p_impuesto_tarjeta`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `impuesto_id` | bigint |  | NO |  |
| 2 | `nombre_impuesto` | text |  | YES | 'Impuesto País/CABA/Otros'::text |
| 3 | `porcentaje` | numeric |  | NO |  |
| 4 | `activo` | boolean |  | YES | true |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `PK` p_impuesto_tarjeta_pkey: PRIMARY KEY (impuesto_id)

## `p_indices_precios`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `indice_id` | bigint |  | NO |  |
| 2 | `mes` | integer |  | NO |  |
| 3 | `anio` | integer |  | NO |  |
| 4 | `valor_ipc` | numeric |  | NO |  |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `CHECK` p_indices_precios_mes_check: CHECK (((mes >= 1) AND (mes <= 12)))
- `PK` p_indices_precios_pkey: PRIMARY KEY (indice_id)
- `UNIQUE` p_indices_precios_mes_anio_key: UNIQUE (mes, anio)

## `p_ingresos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `producto_id` | bigint |  | NO |  |
| 3 | `nombre` | text |  | NO |  |
| 10 | `descripcion` | text |  | YES |  |
| 12 | `user_id` | bigint |  | NO |  |
| 13 | `icono` | text |  | YES | '💰'::text |
| 14 | `color` | text |  | YES | '#22C55E'::text |
| 15 | `es_pasivo` | boolean |  | YES | false |
| 16 | `activo` | boolean |  | NO | true |

**Restricciones**

- `FK` p_ingresos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_ingresos_pkey: PRIMARY KEY (producto_id)

## `p_inversiones`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `inversion_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `nombre_activo` | text |  | NO |  |
| 4 | `monto_invertido_original` | numeric |  | NO |  |
| 5 | `billetera_origen_id` | bigint |  | YES |  |
| 6 | `fecha_inicio` | date |  | NO |  |
| 7 | `estado` | text |  | YES | 'activa'::text |
| 8 | `creado_at` | timestamp with time zone |  | YES | now() |
| 9 | `tasa_anual_tna` | numeric |  | YES | 0 |
| 10 | `valor_mercado_actual` | numeric |  | YES |  |
| 11 | `monto_liquidado` | numeric |  | YES |  |
| 12 | `fecha_liquidacion` | date |  | YES |  |
| 13 | `moneda` | text |  | YES | 'ARS'::text |
| 14 | `ultima_conciliacion` | date |  | YES | CURRENT_DATE |
| 15 | `hogar_id` | bigint |  | YES |  |

**Restricciones**

- `FK` p_inversiones_billetera_origen_id_fkey: FOREIGN KEY (billetera_origen_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_inversiones_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_inversiones_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_inversiones_pkey: PRIMARY KEY (inversion_id)

## `p_inyecciones_presupuesto`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `inyeccion_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `mes_periodo` | date |  | NO |  |
| 4 | `monto_inyectado` | numeric |  | NO |  |
| 5 | `billetera_origen_id` | bigint |  | YES |  |
| 6 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_inyecciones_presupuesto_billetera_origen_id_fkey: FOREIGN KEY (billetera_origen_id) REFERENCES p_billeteras(billetera_id) ON DELETE CASCADE
- `FK` p_inyecciones_presupuesto_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_inyecciones_presupuesto_pkey: PRIMARY KEY (inyeccion_id)

## `p_legal_consentimientos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `doc_type` | text |  | NO |  |
| 4 | `evento` | text |  | NO |  |
| 5 | `version` | text |  | NO |  |
| 6 | `created_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_legal_consentimientos_doc_type_check: CHECK ((doc_type = ANY (ARRAY['terminos'::text, 'privacidad'::text])))
- `CHECK` p_legal_consentimientos_evento_check: CHECK ((evento = ANY (ARRAY['aceptado'::text, 'notificado'::text, 'abierto'::text])))
- `FK` p_legal_consentimientos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_legal_consentimientos_pkey: PRIMARY KEY (id)

## `p_monedas`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `codigo` | character(3) | 3 | NO |  |
| 2 | `decimales` | smallint |  | NO | 2 |
| 3 | `simbolo` | text |  | YES |  |
| 4 | `activa` | boolean |  | NO | false |
| 5 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `PK` p_monedas_pkey: PRIMARY KEY (codigo)

## `p_notificaciones_config`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `push_enabled` | boolean |  | YES | true |
| 3 | `push_time` | time without time zone |  | YES | '09:00:00'::time without time zone |
| 4 | `reminder_daily_expenses` | boolean |  | YES | true |
| 5 | `reminder_daily_expenses_time` | time without time zone |  | YES | '20:00:00'::time without time zone |
| 6 | `cat_vencimientos` | boolean |  | YES | true |
| 7 | `cat_recurrentes` | boolean |  | YES | true |
| 8 | `cat_liquidez` | boolean |  | YES | true |
| 9 | `cat_presupuesto` | boolean |  | YES | true |
| 10 | `cat_cuarentena` | boolean |  | YES | true |
| 11 | `cat_deuda` | boolean |  | YES | true |
| 12 | `cat_ahorro` | boolean |  | YES | true |
| 13 | `cat_inversiones` | boolean |  | YES | true |
| 14 | `cat_hogar` | boolean |  | YES | true |
| 15 | `cat_score` | boolean |  | YES | true |
| 16 | `cat_resumen_semanal` | boolean |  | YES | true |
| 17 | `cat_resumen_mensual` | boolean |  | YES | true |
| 18 | `balance_desequilibrado_threshold` | numeric |  | YES | 100000 |
| 19 | `creado_at` | timestamp with time zone |  | YES | now() |
| 20 | `actualizado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_notificaciones_config_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_notificaciones_config_pkey: PRIMARY KEY (user_id)

## `p_notificaciones_enviadas`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `notificacion_id` | bigint |  | NO | nextval('p_notificaciones_enviadas_notificacion_id_seq'::regclass) |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `tipo_notificacion` | text |  | NO |  |
| 4 | `referencia_id` | bigint |  | YES |  |
| 5 | `canal` | text |  | NO |  |
| 6 | `titulo` | text |  | NO |  |
| 7 | `mensaje` | text |  | NO |  |
| 8 | `leida` | boolean |  | YES | false |
| 9 | `pausada_hasta` | timestamp with time zone |  | YES |  |
| 10 | `enviado_at` | timestamp with time zone |  | YES | now() |
| 11 | `leida_at` | timestamp with time zone |  | YES |  |
| 12 | `metadata` | jsonb |  | YES |  |
| 13 | `familia` | text |  | NO | 'operativo'::text |
| 14 | `categoria` | text |  | YES |  |
| 15 | `dedupe_key` | text |  | YES |  |
| 16 | `prioridad` | smallint |  | NO | 50 |
| 17 | `expira_at` | timestamp with time zone |  | YES |  |
| 18 | `presentada_at` | timestamp with time zone |  | YES |  |
| 19 | `accion_completada_at` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` p_notificaciones_enviadas_familia_check: CHECK ((familia = ANY (ARRAY['operativo'::text, 'engage'::text])))
- `FK` p_notificaciones_enviadas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_notificaciones_enviadas_pkey: PRIMARY KEY (notificacion_id)

## `p_pagos_tarjeta_log`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `p_caja_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `tarjeta_id` | bigint |  | NO |  |
| 4 | `monto_total` | numeric |  | NO |  |
| 5 | `liquidado` | numeric |  | NO | 0 |
| 6 | `aporte_saldo` | numeric |  | NO | 0 |
| 7 | `refinanciado` | numeric |  | NO | 0 |
| 8 | `cuota_refi_id` | bigint |  | YES |  |
| 9 | `cuotas_ids` | ARRAY |  | NO | '{}'::bigint[] |
| 10 | `cotizacion_usd` | numeric |  | YES |  |
| 12 | `monto_total_ars` | numeric |  | YES |  |
| 13 | `monto_total_usd` | numeric |  | YES |  |
| 14 | `pagos_aplicados` | jsonb |  | YES |  |
| 15 | `aporte_saldo_usd` | numeric |  | YES |  |
| 16 | `refinanciado_ars` | numeric |  | YES |  |
| 17 | `refinanciado_usd` | numeric |  | YES |  |
| 18 | `cuota_refi_id_ars` | bigint |  | YES |  |
| 19 | `cuota_refi_id_usd` | bigint |  | YES |  |
| 20 | `cuotas_adelantadas` | jsonb |  | YES |  |
| 21 | `total_adelantado_ars` | numeric |  | YES |  |
| 22 | `total_adelantado_usd` | numeric |  | YES |  |
| 23 | `favor_acreditado` | numeric |  | YES | 0 |

**Restricciones**

- `FK` p_pagos_tarjeta_log_p_caja_id_fkey: FOREIGN KEY (p_caja_id) REFERENCES p_caja(p_caja_id) ON DELETE CASCADE
- `PK` p_pagos_tarjeta_log_pkey: PRIMARY KEY (p_caja_id)

## `p_paises`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `codigo` | character(2) | 2 | NO |  |
| 2 | `moneda_local` | character(3) | 3 | NO |  |
| 3 | `idioma_sugerido` | character(2) | 2 | NO | 'en'::bpchar |
| 4 | `separador_miles` | text |  | NO |  |
| 5 | `separador_decimal` | text |  | NO |  |
| 6 | `primer_dia_semana` | smallint |  | NO | 1 |
| 7 | `formato_fecha` | text |  | NO | 'DD/MM/YYYY'::text |
| 8 | `formato_hora` | text |  | NO | '24h'::text |
| 9 | `soportado` | boolean |  | NO | false |
| 10 | `orden` | smallint |  | YES |  |
| 11 | `creado_at` | timestamp with time zone |  | NO | now() |
| 12 | `nombre` | text |  | YES |  |

**Restricciones**

- `FK` p_paises_moneda_local_fkey: FOREIGN KEY (moneda_local) REFERENCES p_monedas(codigo)
- `PK` p_paises_pkey: PRIMARY KEY (codigo)

## `p_pin_seguridad`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `pin_row_id` | bigint |  | NO | nextval('p_pin_seguridad_pin_row_id_seq'::regclass) |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `pin_hash` | text |  | YES |  |
| 4 | `estado` | text |  | NO | 'sin_pin'::text |
| 5 | `intentos_fallidos` | integer |  | NO | 0 |
| 6 | `bloqueado_hasta` | timestamp with time zone |  | YES |  |
| 7 | `pin_ultimo_cambio` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` p_pin_seguridad_estado_check: CHECK ((estado = ANY (ARRAY['sin_pin'::text, 'activa'::text, 'en_cooldown'::text, 'restaurar'::text])))
- `CHECK` p_pin_seguridad_intentos_fallidos_check: CHECK ((intentos_fallidos >= 0))
- `FK` p_pin_seguridad_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_pin_seguridad_pkey: PRIMARY KEY (pin_row_id)
- `UNIQUE` p_pin_seguridad_user_id_key: UNIQUE (user_id)

## `p_preferencias_usuario`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `tema` | text |  | YES | 'auto'::text |
| 3 | `tamanio_fuente` | text |  | YES | 'mediano'::text |
| 4 | `ocultar_montos` | boolean |  | YES | false |
| 5 | `decimales_moneda_local` | smallint |  | YES | 0 |
| 6 | `decimales_segunda_moneda` | smallint |  | YES | 1 |
| 7 | `separador_miles` | text |  | YES | '.'::text |
| 8 | `separador_decimal` | text |  | YES | ','::text |
| 9 | `primer_dia_semana` | smallint |  | YES | 1 |
| 10 | `formato_fecha` | text |  | YES | 'DD/MM/YYYY'::text |
| 11 | `billetera_default_egreso` | bigint |  | YES |  |
| 12 | `billetera_default_ingreso` | bigint |  | YES |  |
| 13 | `categoria_default_sin_clasificar` | bigint |  | YES |  |
| 14 | `ocr_auto_aprobar` | boolean |  | YES | false |
| 15 | `ocr_confianza_minima` | smallint |  | YES | 80 |
| 16 | `voz_activada` | boolean |  | YES | true |
| 17 | `creado_at` | timestamp with time zone |  | YES | now() |
| 18 | `actualizado_at` | timestamp with time zone |  | YES | now() |
| 19 | `home_preferencias` | jsonb |  | NO | '{}'::jsonb |
| 20 | `orden_billeteras` | text |  | NO | 'valor'::text |
| 21 | `formato_hora` | text |  | NO | '24h'::text |

**Restricciones**

- `CHECK` p_preferencias_orden_billeteras_check: CHECK ((orden_billeteras = ANY (ARRAY['valor'::text, 'alfabetico'::text])))
- `CHECK` p_preferencias_usuario_formato_hora_chk: CHECK ((formato_hora = ANY (ARRAY['12h'::text, '24h'::text])))
- `FK` p_preferencias_usuario_billetera_default_egreso_fkey: FOREIGN KEY (billetera_default_egreso) REFERENCES p_billeteras(billetera_id) ON DELETE SET NULL
- `FK` p_preferencias_usuario_billetera_default_ingreso_fkey: FOREIGN KEY (billetera_default_ingreso) REFERENCES p_billeteras(billetera_id) ON DELETE SET NULL
- `FK` p_preferencias_usuario_categoria_default_sin_clasificar_fkey: FOREIGN KEY (categoria_default_sin_clasificar) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE SET NULL
- `FK` p_preferencias_usuario_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_preferencias_usuario_pkey: PRIMARY KEY (user_id)

## `p_prestamos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `prestamo_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `entidad_nombre` | text |  | NO |  |
| 4 | `tipo_entidad` | text |  | YES |  |
| 5 | `tipo_flujo` | text |  | YES |  |
| 6 | `monto_total_deuda` | numeric |  | NO |  |
| 7 | `monto_pagado_acumulado` | numeric |  | YES | 0 |
| 8 | `moneda_iso` | character(3) | 3 | YES | 'ARS'::bpchar |
| 9 | `estado` | text |  | YES | 'activo'::text |
| 10 | `p_caja_id` | bigint |  | YES |  |
| 11 | `creado_at` | timestamp with time zone |  | YES | now() |
| 12 | `nombre_prestamo` | text |  | YES |  |
| 13 | `tipo_deuda` | text |  | YES |  |
| 14 | `saldo_actual` | numeric |  | NO | 0 |
| 15 | `tasa_anual_tna` | numeric |  | YES | 0 |
| 16 | `cuota_mensual` | numeric |  | YES | 0 |
| 17 | `proximo_vencimiento` | date |  | YES |  |
| 18 | `monto_original` | numeric |  | NO |  |
| 19 | `saldo_al_ingreso` | numeric |  | NO | 0 |
| 20 | `modalidad` | text |  | NO | 'libre'::text |
| 21 | `condicion_interes` | text |  | NO | 'desconocido'::text |
| 22 | `interes_total_acordado` | numeric |  | YES |  |
| 23 | `tasa_informada` | boolean |  | NO | false |
| 24 | `puntos_vinculo` | smallint |  | YES |  |
| 25 | `eliminado_at` | timestamp with time zone |  | YES |  |
| 26 | `hogar_id` | bigint |  | YES |  |
| 27 | `contraparte_user_id` | bigint |  | YES |  |

**Restricciones**

- `CHECK` p_prestamos_condicion_interes_check: CHECK ((condicion_interes = ANY (ARRAY['ninguno'::text, 'importe_final'::text, 'tasa'::text, 'desconocido'::text])))
- `CHECK` p_prestamos_estado_check: CHECK ((estado = ANY (ARRAY['activo'::text, 'archivado'::text, 'pagado'::text, 'refinanciado'::text, 'pendiente'::text, 'parcial'::text, 'cancelado'::text, 'eliminado'::text])))
- `CHECK` p_prestamos_modalidad_check: CHECK ((modalidad = ANY (ARRAY['cuotas'::text, 'vencimiento_unico'::text, 'libre'::text])))
- `CHECK` p_prestamos_puntos_vinculo_check: CHECK (((puntos_vinculo IS NULL) OR (puntos_vinculo = ANY (ARRAY[0, 3, 5, 6, 8, 11]))))
- `CHECK` p_prestamos_tipo_entidad_check: CHECK ((tipo_entidad = ANY (ARRAY['banco'::text, 'tarjeta'::text, 'familiar'::text, 'otro'::text, 'bancario'::text, 'tercero'::text, 'entidad_financiera'::text])))
- `CHECK` p_prestamos_tipo_flujo_check: CHECK ((tipo_flujo = ANY (ARRAY['debo'::text, 'me_deben'::text])))
- `FK` p_prestamos_contraparte_user_id_fkey: FOREIGN KEY (contraparte_user_id) REFERENCES usuarios(user_id) ON DELETE SET NULL
- `FK` p_prestamos_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_prestamos_p_caja_id_fkey: FOREIGN KEY (p_caja_id) REFERENCES p_caja(p_caja_id) ON DELETE CASCADE
- `FK` p_prestamos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_prestamos_pkey: PRIMARY KEY (prestamo_id)

## `p_prestamos_cuotas`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `cuota_id` | bigint |  | NO |  |
| 2 | `prestamo_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | NO |  |
| 4 | `numero_cuota` | integer |  | NO |  |
| 5 | `fecha_vencimiento` | date |  | NO |  |
| 6 | `monto_cuota` | numeric |  | NO |  |
| 7 | `capital_componente` | numeric |  | YES |  |
| 8 | `interes_componente` | numeric |  | YES |  |
| 9 | `moneda` | text |  | NO |  |
| 10 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_prestamos_cuotas_componentes_no_negativos: CHECK ((((capital_componente IS NULL) OR (capital_componente >= (0)::numeric)) AND ((interes_componente IS NULL) OR (interes_componente >= (0)::numeric))))
- `CHECK` p_prestamos_cuotas_monto_positivo: CHECK ((monto_cuota > (0)::numeric))
- `CHECK` p_prestamos_cuotas_numero_positivo: CHECK ((numero_cuota > 0))
- `FK` p_prestamos_cuotas_prestamo_id_fkey: FOREIGN KEY (prestamo_id) REFERENCES p_prestamos(prestamo_id) ON DELETE CASCADE
- `FK` p_prestamos_cuotas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_prestamos_cuotas_pkey: PRIMARY KEY (cuota_id)
- `UNIQUE` p_prestamos_cuotas_numero_unico: UNIQUE (prestamo_id, numero_cuota)

## `p_prestamos_pagos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `pago_id` | bigint |  | NO |  |
| 2 | `prestamo_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | NO |  |
| 4 | `p_caja_id` | bigint |  | YES |  |
| 5 | `direccion` | text |  | NO |  |
| 6 | `fecha` | date |  | NO |  |
| 7 | `billetera_id` | bigint |  | YES |  |
| 8 | `moneda_billetera` | text |  | NO |  |
| 9 | `monto_billetera` | numeric |  | NO |  |
| 10 | `moneda_prestamo` | text |  | NO |  |
| 11 | `monto_aplicado` | numeric |  | NO |  |
| 12 | `capital_aplicado` | numeric |  | YES |  |
| 13 | `interes_aplicado` | numeric |  | YES |  |
| 14 | `interes_excedente` | numeric |  | YES |  |
| 15 | `nota` | text |  | YES |  |
| 16 | `estado` | text |  | NO | 'activo'::text |
| 17 | `corregido_at` | timestamp with time zone |  | YES |  |
| 18 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_prestamos_pagos_direccion_check: CHECK ((direccion = ANY (ARRAY['pago'::text, 'cobro'::text])))
- `CHECK` p_prestamos_pagos_estado_check: CHECK ((estado = ANY (ARRAY['activo'::text, 'anulado'::text])))
- `CHECK` p_prestamos_pagos_montos_no_negativos: CHECK (((monto_billetera > (0)::numeric) AND (monto_aplicado >= (0)::numeric) AND ((capital_aplicado IS NULL) OR (capital_aplicado >= (0)::numeric)) AND ((interes_aplicado IS NULL) OR (interes_aplicado >= (0)::numeric)) AND ((interes_excedente IS NULL) OR (interes_excedente >= (0)::numeric))))
- `FK` p_prestamos_pagos_billetera_id_fkey: FOREIGN KEY (billetera_id) REFERENCES p_billeteras(billetera_id) ON DELETE SET NULL
- `FK` p_prestamos_pagos_p_caja_id_fkey: FOREIGN KEY (p_caja_id) REFERENCES p_caja(p_caja_id) ON DELETE CASCADE
- `FK` p_prestamos_pagos_prestamo_id_fkey: FOREIGN KEY (prestamo_id) REFERENCES p_prestamos(prestamo_id) ON DELETE CASCADE
- `FK` p_prestamos_pagos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_prestamos_pagos_pkey: PRIMARY KEY (pago_id)

## `p_prestamos_vinculos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `prestamo_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `criterio` | smallint |  | NO |  |
| 4 | `seleccionado` | boolean |  | NO | false |
| 5 | `actualizado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` p_prestamos_vinculos_criterio_check: CHECK ((criterio = ANY (ARRAY[1, 2, 3])))
- `FK` p_prestamos_vinculos_prestamo_id_fkey: FOREIGN KEY (prestamo_id) REFERENCES p_prestamos(prestamo_id) ON DELETE CASCADE
- `FK` p_prestamos_vinculos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_prestamos_vinculos_pkey: PRIMARY KEY (prestamo_id, criterio)

## `p_presupuestos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `presupuesto_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | YES |  |
| 4 | `hogar_id` | bigint |  | YES |  |
| 5 | `monto_limite` | numeric |  | NO | 0 |
| 6 | `mes_periodo` | date |  | NO |  |
| 7 | `creado_at` | timestamp with time zone |  | YES | now() |
| 8 | `estructura_egreso_id` | bigint |  | YES |  |
| 9 | `dia_ancla` | smallint |  | YES | 1 |
| 10 | `monto_techo` | numeric |  | YES |  |

**Restricciones**

- `FK` p_presupuestos_estructura_egreso_id_fkey: FOREIGN KEY (estructura_egreso_id) REFERENCES p_estructuras_egresos(estructura_id) ON DELETE CASCADE
- `FK` p_presupuestos_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_presupuestos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_presupuestos_pkey: PRIMARY KEY (presupuesto_id)

## `p_presupuestos_cierre`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `cierre_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `hogar_id` | bigint |  | YES |  |
| 4 | `mes_periodo` | date |  | NO |  |
| 5 | `estructura_egreso_id` | bigint |  | NO | 0 |
| 6 | `tipo` | text |  | NO | 'cierre'::text |
| 7 | `monto_limite` | numeric |  | NO | 0 |
| 8 | `monto_gastado` | numeric |  | NO | 0 |
| 9 | `saldo_cierre` | numeric |  | NO | 0 |
| 10 | `detalle` | jsonb |  | YES |  |
| 11 | `motivo` | text |  | YES |  |
| 12 | `ciclo_corregido` | date |  | YES |  |
| 13 | `creado_at` | timestamp with time zone |  | NO | now() |
| 14 | `padre_id` | bigint |  | YES |  |
| 15 | `monto_techo` | numeric |  | YES |  |

**Restricciones**

- `PK` p_presupuestos_cierre_pkey: PRIMARY KEY (cierre_id)

## `p_presupuestos_config`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `config_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `porcentaje_necesidades` | numeric |  | YES | 50.00 |
| 4 | `porcentaje_deseos` | numeric |  | YES | 30.00 |
| 5 | `porcentaje_ahorro` | numeric |  | YES | 20.00 |
| 6 | `porcentaje_diezmo` | numeric |  | YES | 0.00 |
| 7 | `dia_ancla_ciclo` | smallint |  | YES | 1 |
| 8 | `creado_at` | timestamp with time zone |  | YES | now() |
| 9 | `modo_presupuesto` | text |  | YES | 'anticipado'::text |
| 10 | `fecha_activacion_base_cero` | date |  | YES |  |
| 11 | `cierre_desde` | date |  | YES |  |

**Restricciones**

- `CHECK` chk_suma_cien: CHECK (((((porcentaje_necesidades + porcentaje_deseos) + porcentaje_ahorro) + porcentaje_diezmo) = 100.00))
- `CHECK` p_presupuestos_config_dia_ancla_ciclo_check: CHECK (((dia_ancla_ciclo >= 1) AND (dia_ancla_ciclo <= 31)))
- `CHECK` p_presupuestos_config_modo_presupuesto_check: CHECK ((modo_presupuesto = ANY (ARRAY['anticipado'::text, 'base_cero'::text])))
- `FK` p_presupuestos_config_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_presupuestos_config_pkey: PRIMARY KEY (config_id)
- `UNIQUE` p_presupuestos_config_user_id_key: UNIQUE (user_id)

## `p_presupuestos_historial`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `historial_id` | bigint |  | NO |  |
| 2 | `presupuesto_id` | bigint |  | YES |  |
| 3 | `estructura_egreso_id` | bigint |  | YES |  |
| 4 | `user_id` | bigint |  | YES |  |
| 5 | `hogar_id` | bigint |  | YES |  |
| 6 | `mes_periodo` | date |  | NO |  |
| 7 | `dia_ancla` | smallint |  | YES |  |
| 8 | `monto_limite` | numeric |  | NO |  |
| 9 | `motivo` | text |  | NO |  |
| 10 | `modo_origen` | text |  | YES |  |
| 11 | `modo_destino` | text |  | YES |  |
| 12 | `creado_at` | timestamp with time zone |  | NO | now() |
| 13 | `idempotency_key` | text |  | YES |  |
| 14 | `monto_techo` | numeric |  | YES |  |

**Restricciones**

- `PK` p_presupuestos_historial_pkey: PRIMARY KEY (historial_id)

## `p_proyectos_compartidos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `proyecto_id` | bigint |  | NO |  |
| 2 | `hogar_id` | bigint |  | YES |  |
| 3 | `nombre_proyecto` | text |  | NO |  |
| 4 | `presupuesto_meta` | numeric |  | YES | 0.00 |
| 5 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `FK` p_proyectos_compartidos_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `PK` p_proyectos_compartidos_pkey: PRIMARY KEY (proyecto_id)

## `p_recordatorios`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `recordatorio_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `titulo` | text |  | NO |  |
| 4 | `descripcion` | text |  | YES |  |
| 5 | `hora` | time without time zone |  | NO |  |
| 6 | `dias_semana` | ARRAY |  | YES |  |
| 7 | `recurrente` | boolean |  | NO | true |
| 8 | `fecha_unica` | date |  | YES |  |
| 9 | `activo` | boolean |  | NO | true |
| 10 | `created_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `CHECK` chk_recurrente_dias: CHECK ((((recurrente = true) AND (dias_semana IS NOT NULL) AND (array_length(dias_semana, 1) >= 1) AND (fecha_unica IS NULL)) OR ((recurrente = false) AND (fecha_unica IS NOT NULL) AND (dias_semana IS NULL))))
- `CHECK` p_recordatorios_descripcion_check: CHECK (((descripcion IS NULL) OR (length(descripcion) <= 200)))
- `CHECK` p_recordatorios_titulo_check: CHECK (((length(titulo) >= 1) AND (length(titulo) <= 60)))
- `FK` p_recordatorios_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_recordatorios_pkey: PRIMARY KEY (recordatorio_id)

## `p_referidos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `referido_id` | bigint |  | NO |  |
| 2 | `user_id_invitador` | bigint |  | NO |  |
| 3 | `codigo_referido` | text |  | NO |  |
| 4 | `user_id_invitado` | bigint |  | YES |  |
| 5 | `email_invitado` | text |  | YES |  |
| 6 | `completado_onboarding` | boolean |  | YES | false |
| 7 | `suscrito_premium` | boolean |  | YES | false |
| 8 | `fecha_suscripcion` | timestamp with time zone |  | YES |  |
| 9 | `beneficio_aplicado` | boolean |  | YES | false |
| 10 | `creado_at` | timestamp with time zone |  | YES | now() |
| 11 | `usado_at` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` chk_no_self_invite: CHECK ((user_id_invitador IS DISTINCT FROM user_id_invitado))
- `FK` p_referidos_user_id_invitado_fkey: FOREIGN KEY (user_id_invitado) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `FK` p_referidos_user_id_invitador_fkey: FOREIGN KEY (user_id_invitador) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_referidos_pkey: PRIMARY KEY (referido_id)
- `UNIQUE` p_referidos_codigo_referido_key: UNIQUE (codigo_referido)

## `p_sobre_movimientos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `movimiento_id` | bigint |  | NO |  |
| 2 | `sobre_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | NO |  |
| 4 | `tipo` | text |  | NO |  |
| 5 | `importe` | numeric |  | NO |  |
| 6 | `moneda` | text |  | NO |  |
| 7 | `billetera_id` | bigint |  | NO |  |
| 8 | `modalidad` | text |  | NO |  |
| 9 | `genera_rendimiento` | boolean |  | NO | false |
| 10 | `fecha` | date |  | NO | CURRENT_DATE |
| 11 | `caja_ingreso_id` | bigint |  | YES |  |
| 12 | `corrige_a` | bigint |  | YES |  |
| 14 | `creado_at` | timestamp with time zone |  | NO | now() |
| 15 | `actualizado_at` | timestamp with time zone |  | NO | now() |
| 16 | `caja_movimiento_id` | bigint |  | YES |  |

**Restricciones**

- `CHECK` p_sobre_mov_origen: CHECK ((((tipo = ANY (ARRAY['aporte'::text, 'rescate'::text])) AND (modalidad = ANY (ARRAY['real'::text, 'virtual'::text]))) OR ((tipo = 'rendimiento'::text) AND (modalidad = 'real'::text))))
- `CHECK` p_sobre_mov_rendimiento: CHECK ((((NOT genera_rendimiento) OR (modalidad = 'real'::text)) AND ((tipo <> 'rendimiento'::text) OR genera_rendimiento)))
- `CHECK` p_sobre_movimientos_importe_check: CHECK ((importe > (0)::numeric))
- `CHECK` p_sobre_movimientos_modalidad_check: CHECK ((modalidad = ANY (ARRAY['real'::text, 'virtual'::text])))
- `CHECK` p_sobre_movimientos_tipo_check: CHECK ((tipo = ANY (ARRAY['aporte'::text, 'rescate'::text, 'rendimiento'::text])))
- `FK` p_sobre_mov_sobre_moneda_fk: FOREIGN KEY (sobre_id, moneda) REFERENCES p_sobres(sobre_id, moneda) ON DELETE RESTRICT
- `FK` p_sobre_movimientos_billetera_id_fkey: FOREIGN KEY (billetera_id) REFERENCES p_billeteras(billetera_id) ON DELETE RESTRICT
- `FK` p_sobre_movimientos_caja_id_fkey: FOREIGN KEY (caja_ingreso_id) REFERENCES p_caja(p_caja_id) ON DELETE SET NULL
- `FK` p_sobre_movimientos_caja_movimiento_id_fkey: FOREIGN KEY (caja_movimiento_id) REFERENCES p_caja(p_caja_id) ON DELETE SET NULL
- `FK` p_sobre_movimientos_corrige_a_fkey: FOREIGN KEY (corrige_a) REFERENCES p_sobre_movimientos(movimiento_id) ON DELETE SET NULL
- `FK` p_sobre_movimientos_sobre_id_fkey: FOREIGN KEY (sobre_id) REFERENCES p_sobres(sobre_id) ON DELETE RESTRICT
- `FK` p_sobre_movimientos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_sobre_movimientos_pkey: PRIMARY KEY (movimiento_id)

## `p_sobre_movimientos_auditoria`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `auditoria_id` | bigint |  | NO |  |
| 2 | `movimiento_id` | bigint |  | NO |  |
| 3 | `user_id` | bigint |  | NO |  |
| 4 | `datos_anteriores` | jsonb |  | NO |  |
| 5 | `datos_nuevos` | jsonb |  | NO |  |
| 6 | `motivo` | text |  | YES |  |
| 7 | `creado_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `FK` p_sobre_movimientos_auditoria_movimiento_id_fkey: FOREIGN KEY (movimiento_id) REFERENCES p_sobre_movimientos(movimiento_id) ON DELETE RESTRICT
- `FK` p_sobre_movimientos_auditoria_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_sobre_movimientos_auditoria_pkey: PRIMARY KEY (auditoria_id)

## `p_sobres`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `sobre_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `nombre` | text |  | NO |  |
| 4 | `moneda` | text |  | NO |  |
| 5 | `monto_meta` | numeric |  | YES |  |
| 6 | `fecha_objetivo` | date |  | YES |  |
| 7 | `plan_inicio_at` | date |  | NO | CURRENT_DATE |
| 8 | `orden` | integer |  | NO | 0 |
| 9 | `orden_manual` | boolean |  | NO | false |
| 10 | `archivado_at` | timestamp with time zone |  | YES |  |
| 11 | `icono` | text |  | NO | '💰'::text |
| 13 | `creado_at` | timestamp with time zone |  | NO | now() |
| 14 | `actualizado_at` | timestamp with time zone |  | NO | now() |
| 15 | `hogar_id` | bigint |  | YES |  |

**Restricciones**

- `CHECK` p_sobres_fecha_requiere_meta: CHECK (((fecha_objetivo IS NULL) OR (monto_meta IS NOT NULL)))
- `CHECK` p_sobres_meta_positiva: CHECK (((monto_meta IS NULL) OR (monto_meta > (0)::numeric)))
- `CHECK` p_sobres_moneda_no_vacia: CHECK ((length(btrim(moneda)) > 0))
- `CHECK` p_sobres_nombre_no_vacio: CHECK ((length(btrim(nombre)) > 0))
- `FK` p_sobres_hogar_id_fkey: FOREIGN KEY (hogar_id) REFERENCES p_hogares(hogar_id) ON DELETE CASCADE
- `FK` p_sobres_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_sobres_pkey: PRIMARY KEY (sobre_id)
- `UNIQUE` p_sobres_sobre_moneda_uq: UNIQUE (sobre_id, moneda)

## `p_tarjetas_credito`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `tarjeta_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `nombre_tarjeta` | text |  | NO |  |
| 4 | `dia_cierre` | integer |  | YES |  |
| 5 | `dia_vencimiento` | integer |  | YES |  |
| 6 | `limite_un_pago` | numeric |  | YES | 0 |
| 7 | `limite_cuotas` | numeric |  | YES | 0 |
| 8 | `moneda_iso` | character(3) | 3 | YES | 'ARS'::bpchar |
| 9 | `creado_at` | timestamp with time zone |  | YES | now() |
| 10 | `banco` | text |  | YES |  |
| 11 | `color` | text |  | YES | '#6366F1'::text |
| 12 | `activa` | boolean |  | YES | true |
| 14 | `saldo_a_favor` | numeric |  | NO | 0 |
| 15 | `saldo_a_favor_usd` | numeric |  | NO | 0 |

**Restricciones**

- `CHECK` p_tarjetas_credito_dia_cierre_check: CHECK (((dia_cierre >= 1) AND (dia_cierre <= 31)))
- `CHECK` p_tarjetas_credito_dia_vencimiento_check: CHECK (((dia_vencimiento >= 1) AND (dia_vencimiento <= 31)))
- `FK` p_tarjetas_credito_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_tarjetas_credito_pkey: PRIMARY KEY (tarjeta_id)

## `p_telemetry_cps_snapshots`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `snapshot_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `score_value` | integer |  | NO |  |
| 4 | `score_version` | text |  | NO | 'cps_basic_v1'::text |
| 5 | `categoria` | text |  | NO |  |
| 6 | `calculated_at` | timestamp with time zone |  | NO | now() |
| 7 | `metrics_snapshot` | jsonb |  | NO | '{}'::jsonb |

**Restricciones**

- `FK` p_telemetry_cps_snapshots_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_telemetry_cps_snapshots_pkey: PRIMARY KEY (snapshot_id)

## `p_telemetry_events`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `event_id` | uuid |  | NO | gen_random_uuid() |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `session_id` | uuid |  | YES |  |
| 4 | `event_name` | text |  | NO |  |
| 5 | `event_timestamp` | timestamp with time zone |  | NO | now() |
| 6 | `received_at` | timestamp with time zone |  | NO | now() |
| 7 | `app_version` | text |  | YES |  |
| 8 | `platform` | text |  | YES |  |
| 9 | `schema_version` | text |  | NO | 'basic_v1'::text |
| 10 | `priority` | smallint |  | NO | 2 |
| 11 | `properties` | jsonb |  | NO | '{}'::jsonb |
| 12 | `created_at` | timestamp with time zone |  | NO | now() |

**Restricciones**

- `FK` fk_telemetry_session: FOREIGN KEY (session_id) REFERENCES p_app_sessions(session_id) ON DELETE SET NULL
- `FK` p_telemetry_events_session_id_fkey: FOREIGN KEY (session_id) REFERENCES p_app_sessions(session_id) ON DELETE CASCADE
- `FK` p_telemetry_events_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE NOT VALID
- `PK` p_telemetry_events_pkey: PRIMARY KEY (event_id)

## `p_telemetry_user_metrics`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `calculated_at` | timestamp with time zone |  | NO | now() |
| 3 | `active_days_7d` | integer |  | NO | 0 |
| 4 | `active_days_30d` | integer |  | NO | 0 |
| 5 | `movement_days_30d` | integer |  | NO | 0 |
| 6 | `sessions_30d` | integer |  | NO | 0 |
| 7 | `active_seconds_30d` | integer |  | NO | 0 |
| 8 | `active_wallet_count` | integer |  | NO | 0 |
| 9 | `custom_category_count` | integer |  | NO | 0 |
| 10 | `distinct_categories_used_30d` | integer |  | NO | 0 |
| 11 | `reconciliation_count` | integer |  | NO | 0 |
| 12 | `days_since_last_reconciliation` | integer |  | YES |  |
| 13 | `active_card_count` | integer |  | NO | 0 |
| 14 | `has_card_activity_30d` | boolean |  | NO | false |
| 15 | `budget_coverage_ratio` | numeric |  | NO | 0 |
| 16 | `budget_used_next_cycle` | boolean |  | NO | false |
| 17 | `modules_used_30d` | jsonb |  | NO | '{}'::jsonb |

**Restricciones**

- `FK` p_telemetry_user_metrics_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_telemetry_user_metrics_pkey: PRIMARY KEY (user_id)

## `p_vendedores_app`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `vendedor_app_id` | bigint |  | NO |  |
| 2 | `nombre` | text |  | NO |  |
| 3 | `telefono` | text |  | YES |  |
| 4 | `email` | text |  | YES |  |
| 5 | `porcentaje_comision` | numeric |  | YES | 0 |
| 6 | `comision_fija_entrega` | numeric |  | YES | 0 |
| 7 | `activo` | boolean |  | YES | true |
| 8 | `observaciones` | text |  | YES |  |
| 9 | `creado_at` | timestamp with time zone |  | YES | now() |

**Restricciones**

- `PK` p_vendedores_app_pkey: PRIMARY KEY (vendedor_app_id)

## `p_webhook_queue`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `webhook_id` | bigint |  | NO |  |
| 2 | `user_id` | bigint |  | NO |  |
| 3 | `tipo_evento` | text |  | NO |  |
| 4 | `payload` | jsonb |  | NO | '{}'::jsonb |
| 5 | `estado` | text |  | NO | 'pendiente'::text |
| 6 | `intentos` | integer |  | NO | 0 |
| 7 | `ultimo_error` | text |  | YES |  |
| 8 | `creado_at` | timestamp with time zone |  | YES | now() |
| 9 | `procesado_at` | timestamp with time zone |  | YES |  |

**Restricciones**

- `CHECK` chk_webhook_estado: CHECK ((estado = ANY (ARRAY['pendiente'::text, 'procesando'::text, 'completado'::text, 'fallido'::text])))
- `FK` p_webhook_queue_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` p_webhook_queue_pkey: PRIMARY KEY (webhook_id)

## `productos`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `producto_id` | bigint |  | NO |  |
| 3 | `nombre` | text |  | NO |  |
| 4 | `precio_vta` | integer |  | NO | 0 |
| 5 | `cv1` | integer |  | NO | 0 |
| 6 | `cv2` | integer |  | NO | 0 |
| 7 | `cv3` | integer |  | NO | 0 |
| 8 | `cv_total` | integer |  | YES |  |
| 9 | `ganancia` | integer |  | YES |  |
| 10 | `descripcion` | text |  | YES |  |
| 12 | `user_id` | bigint |  | NO |  |

**Restricciones**

- `CHECK` productos_cv1_check: CHECK ((cv1 >= 0))
- `CHECK` productos_cv2_check: CHECK ((cv2 >= 0))
- `CHECK` productos_cv3_check: CHECK ((cv3 >= 0))
- `CHECK` productos_precio_vta_check: CHECK ((precio_vta >= 0))
- `FK` productos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` productos_pkey: PRIMARY KEY (producto_id)

## `usuarios`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | NO |  |
| 2 | `nombre` | text |  | NO |  |
| 3 | `telefono` | text |  | YES |  |
| 4 | `documento` | text |  | YES |  |
| 5 | `razon_social` | text |  | YES |  |
| 6 | `tipo_producto` | text |  | YES |  |
| 7 | `valor_entrega` | integer |  | NO | 0 |
| 8 | `valor_mensual_contratado` | integer |  | NO | 0 |
| 9 | `mes_ultimo_pago` | text |  | YES |  |
| 10 | `creado_at` | timestamp with time zone |  | NO | now() |
| 11 | `login` | text |  | NO |  |
| 12 | `password` | text |  | NO |  |
| 13 | `tipo_sistema` | text |  | YES | 'personal'::text |
| 14 | `vendedor_app_id` | bigint |  | YES |  |
| 15 | `asignado_vendedor_at` | timestamp with time zone |  | YES |  |
| 16 | `auth_id` | uuid |  | YES |  |
| 17 | `email` | text |  | YES |  |
| 18 | `deleted_at` | timestamp with time zone |  | YES |  |
| 19 | `estado_cuenta` | text |  | YES | 'activo'::text |
| 20 | `app_version` | text |  | YES |  |
| 21 | `ultimo_login` | timestamp with time zone |  | YES |  |
| 22 | `modo_app` | text |  | NO | 'simple'::text |
| 23 | `total_usage_seconds` | integer |  | NO | 0 |
| 24 | `last_session_at` | timestamp with time zone |  | YES |  |
| 25 | `consentimiento_legal_at` | timestamp with time zone |  | YES |  |
| 26 | `terminos_version_aceptada` | text |  | YES |  |
| 27 | `privacidad_version_aceptada` | text |  | YES |  |
| 28 | `opened_terms` | boolean |  | NO | false |
| 29 | `opened_privacy` | boolean |  | NO | false |
| 30 | `plan_tipo` | text |  | NO | 'trial'::text |

**Restricciones**

- `CHECK` usuarios_modo_app_check: CHECK ((modo_app = ANY (ARRAY['simple'::text, 'avanzado'::text])))
- `CHECK` usuarios_plan_tipo_check: CHECK ((plan_tipo = ANY (ARRAY['trial'::text, 'free'::text, 'premium'::text])))
- `CHECK` usuarios_tipo_sistema_check: CHECK ((tipo_sistema = ANY (ARRAY['empresa'::text, 'personal'::text, 'ambos'::text])))
- `CHECK` usuarios_valor_entrega_check: CHECK ((valor_entrega >= 0))
- `CHECK` usuarios_valor_mensual_contratado_check: CHECK ((valor_mensual_contratado >= 0))
- `FK` usuarios_vendedor_app_id_fkey: FOREIGN KEY (vendedor_app_id) REFERENCES p_vendedores_app(vendedor_app_id) ON DELETE SET NULL
- `PK` usuarios_pkey: PRIMARY KEY (user_id)
- `UNIQUE` usuarios_documento_key: UNIQUE (documento)
- `UNIQUE` usuarios_login_key: UNIQUE (login)

## `v_p_caja_reportable`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `p_caja_id` | bigint |  | YES |  |
| 2 | `user_id` | bigint |  | YES |  |
| 3 | `fecha` | date |  | YES |  |
| 4 | `tipo` | text |  | YES |  |
| 5 | `cuenta_ingreso_id` | bigint |  | YES |  |
| 6 | `billetera_origen_id` | bigint |  | YES |  |
| 7 | `billetera_destino_id` | bigint |  | YES |  |
| 8 | `nombre_cuenta_historico` | text |  | YES |  |
| 9 | `valor_egreso` | numeric |  | YES |  |
| 10 | `valor_ingreso` | numeric |  | YES |  |
| 11 | `observaciones` | text |  | YES |  |
| 12 | `metadata` | jsonb |  | YES |  |
| 13 | `creado_at` | timestamp with time zone |  | YES |  |
| 14 | `familiar_id` | bigint |  | YES |  |
| 15 | `tarjeta_id` | bigint |  | YES |  |
| 16 | `cuotas_totales` | integer |  | YES |  |
| 17 | `es_usd` | boolean |  | YES |  |
| 18 | `hogar_id` | bigint |  | YES |  |
| 19 | `es_compartido` | boolean |  | YES |  |
| 20 | `pagado_por_user_id` | bigint |  | YES |  |
| 21 | `proyecto_id` | bigint |  | YES |  |
| 22 | `en_balance_activo` | boolean |  | YES |  |
| 23 | `porcentaje_creador_snapshot` | numeric |  | YES |  |
| 24 | `porcentaje_invitado_snapshot` | numeric |  | YES |  |
| 25 | `detalle` | text |  | YES |  |
| 26 | `estructura_egreso_id` | bigint |  | YES |  |
| 27 | `moneda` | text |  | YES |  |
| 28 | `parent_pago_caja_id` | bigint |  | YES |  |
| 29 | `resumen_real` | numeric |  | YES |  |
| 30 | `valor_local` | numeric |  | YES |  |
| 31 | `moneda_local` | text |  | YES |  |
| 32 | `tasa_snapshot` | numeric |  | YES |  |

## `v_patrimonio_neto`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `user_id` | bigint |  | YES |  |
| 2 | `total_pesos` | numeric |  | YES |  |
| 3 | `total_solo_pesos` | numeric |  | YES |  |
| 4 | `total_solo_dolares` | numeric |  | YES |  |

## `vendedores`

| # | Columna | Tipo | Largo | Nulo | Default |
|---|---|---|---|---|---|
| 1 | `vendedor_id` | bigint |  | NO |  |
| 3 | `nombre` | text |  | NO |  |
| 4 | `telefono` | text |  | YES |  |
| 5 | `descripcion` | text |  | YES |  |
| 7 | `user_id` | bigint |  | NO |  |

**Restricciones**

- `FK` vendedores_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(user_id) ON DELETE CASCADE
- `PK` vendedores_pkey: PRIMARY KEY (vendedor_id)

