# Esquema instalado del módulo de presupuesto

Generado desde el catálogo real de Supabase con `odd/auditoria-etapa4/generar_esquema.mjs`.
No se edita a mano: se vuelve a generar. Es la fuente que leen las pruebas de estructura,
porque las migraciones de `temp_sql/` están ignoradas por git y nunca fueron la verdad.

Generado: 2026-11-19T13:45:39.997Z

## p_presupuestos

| Columna | Tipo | Nulo | Defecto |
| --- | --- | --- | --- |
| `presupuesto_id` | bigint | no | — |
| `user_id` | bigint | sí | — |
| `hogar_id` | bigint | sí | — |
| `monto_limite` | numeric | no | 0 |
| `mes_periodo` | date | no | — |
| `creado_at` | timestamp with time zone | sí | now() |
| `estructura_egreso_id` | bigint | sí | — |
| `dia_ancla` | smallint | sí | 1 |
| `monto_techo` | numeric | sí | — |

Índices:
- `idx_p_presupuestos_estructura_egreso`: CREATE INDEX idx_p_presupuestos_estructura_egreso ON public.p_presupuestos USING btree (estructura_egreso_id)
- `idx_presupuesto_unico_v2`: CREATE UNIQUE INDEX idx_presupuesto_unico_v2 ON public.p_presupuestos USING btree (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, (0)::bigint))
- `p_presupuestos_pkey`: CREATE UNIQUE INDEX p_presupuestos_pkey ON public.p_presupuestos USING btree (presupuesto_id)

RLS: encendido
- política `allow_security_definer_access` (ALL, roles {postgres}) usando: true
- política `deny_direct_anon_access` (ALL, roles {anon}) usando: false

## p_presupuestos_config

| Columna | Tipo | Nulo | Defecto |
| --- | --- | --- | --- |
| `config_id` | bigint | no | — |
| `user_id` | bigint | sí | — |
| `porcentaje_necesidades` | numeric | sí | 50.00 |
| `porcentaje_deseos` | numeric | sí | 30.00 |
| `porcentaje_ahorro` | numeric | sí | 20.00 |
| `porcentaje_diezmo` | numeric | sí | 0.00 |
| `dia_ancla_ciclo` | smallint | sí | 1 |
| `creado_at` | timestamp with time zone | sí | now() |
| `modo_presupuesto` | text | sí | 'anticipado'::text |
| `fecha_activacion_base_cero` | date | sí | — |

Índices:
- `p_presupuestos_config_pkey`: CREATE UNIQUE INDEX p_presupuestos_config_pkey ON public.p_presupuestos_config USING btree (config_id)
- `p_presupuestos_config_user_id_key`: CREATE UNIQUE INDEX p_presupuestos_config_user_id_key ON public.p_presupuestos_config USING btree (user_id)

RLS: encendido
- política `allow_security_definer_access` (ALL, roles {postgres}) usando: true
- política `deny_direct_anon_access` (ALL, roles {anon}) usando: false

## p_presupuestos_historial

| Columna | Tipo | Nulo | Defecto |
| --- | --- | --- | --- |
| `historial_id` | bigint | no | — |
| `presupuesto_id` | bigint | sí | — |
| `estructura_egreso_id` | bigint | sí | — |
| `user_id` | bigint | sí | — |
| `hogar_id` | bigint | sí | — |
| `mes_periodo` | date | no | — |
| `dia_ancla` | smallint | sí | — |
| `monto_limite` | numeric | no | — |
| `motivo` | text | no | — |
| `modo_origen` | text | sí | — |
| `modo_destino` | text | sí | — |
| `creado_at` | timestamp with time zone | no | now() |
| `idempotency_key` | text | sí | — |
| `monto_techo` | numeric | sí | — |

Índices:
- `idx_p_presupuestos_historial_user_periodo`: CREATE INDEX idx_p_presupuestos_historial_user_periodo ON public.p_presupuestos_historial USING btree (user_id, mes_periodo)
- `idx_presupuesto_historial_idempotencia`: CREATE UNIQUE INDEX idx_presupuesto_historial_idempotencia ON public.p_presupuestos_historial USING btree (user_id, idempotency_key, estructura_egreso_id) WHERE (idempotency_key IS NOT NULL)
- `p_presupuestos_historial_pkey`: CREATE UNIQUE INDEX p_presupuestos_historial_pkey ON public.p_presupuestos_historial USING btree (historial_id)

RLS: encendido

Sin políticas: ningún rol salvo el dueño puede leer ni escribir. El único acceso es por
las funciones `SECURITY DEFINER`.

