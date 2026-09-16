# PLAN — Implementación Telemetría BASIC v1 (ORD Capital Personal)

**Base:** `docs/telemetria/ORD_PRD_Telemetria_BASIC_v1.md`
**Estado:** Planificación completa — pendiente de aprobación para implementación
**Fecha:** septiembre 2026

---

## 1. Principio rector (verificado contra la base real)

> **Si la acción escribe en una tabla funcional → la métrica se DERIVA de esa tabla.
> Si la acción solo se mira / navega / decide → se registra como EVENTO.**

Resultado: de los ~25 eventos que plantea el PRD, solo se implementan **12 eventos nuevos**.
Todo lo demás sale de tablas funcionales que ya existen, con mejor calidad de datos y cero
riesgo de duplicar información financiera en analytics.

---

## 2. Infraestructura (Fase 3, congela el diseño para 3–9)

### 2.1. `p_telemetry_events` (tabla nueva)

| Columna | Tipo | Notas |
|---|---|---|
| event_id | uuid PK | generado en el cliente, permite idempotencia |
| user_id | bigint NOT NULL | |
| session_id | uuid NULL | FK → p_app_sessions |
| event_name | text NOT NULL | catálogo canónico centralizado en frontend |
| event_timestamp | timestamptz NOT NULL | hora del cliente (momento real del evento) |
| received_at | timestamptz DEFAULT now() | hora de llegada al servidor |
| app_version | text | única fuente: APP_VERSION |
| platform | text | web / ios / android |
| schema_version | text DEFAULT 'basic_v1' | |
| priority | smallint | 1 alta / 2 media / 3 baja |
| properties | jsonb DEFAULT '{}' | enums/flags/ids. PROHIBIDO: importes, nombres personalizados, texto libre del usuario |

### 2.2. `fn_telemetry_ingest(p_events jsonb)` (RPC nueva)

- SECURITY DEFINER, resuelve user_id desde auth.uid()
- Valida estructura mínima; `INSERT ... ON CONFLICT (event_id) DO NOTHING`
- Tope ~50 eventos por llamada (protección)
- Nunca lanza error visible; el cliente reintenta

### 2.3. `TelemetryService` (frontend, módulo central único)

- `track(name, props)` síncrono: push a memoria + localStorage. **Nunca `await` en el camino funcional.**
- Cola con respaldo localStorage (sobrevive crash / muerte de la app)
- **Flush:** (1) app pasa a background [primario]; (2) cola = 20 eventos; (3) timer de seguridad 180s; (4) cierre de sesión; (5) reconexión
- Límite de cola: descarta primero prioridad baja (3 → 2 → 1)
- Dedup por sesión vía `Set` en memoria (para eventos "una vez por sesión")
- `screen_name` actual (último módulo) disponible para eventos de error
- session_id estampado desde `useSessionTracker` (ya existe)
- No bloquea UI, sin spinner, sin errores visibles — regla §21/§24 del PRD

---

## 3. Catálogo de eventos (los 12 de Basic v1)

| Evento | Fase | Prioridad | Notas |
|---|---|---|---|
| main_module_opened | 3 | 3 | instrumentado 1 vez en el router; {module, previous_module} |
| home_session_viewed | 3 | 3 | dedup por sesión |
| cards_session_viewed | 7 | 3 | dedup por sesión |
| budget_session_viewed | 8 | 3 | dedup por sesión |
| home_interaction | 3 | 3 | interaction_type: filter_date / filter_wallet / filter_category / donut_detail / recent_movement_open |
| home_movement_edited | 3 | 2 | solo si el flujo nació de Home (decisión: 2 eventos separados, sin tercero) |
| home_movement_deleted | 3 | 2 | idem |
| card_statement_viewed | 7 | 2 | cada consulta, sin dedup |
| card_payment_completed | 7 | 2 | payment_type (minimum/partial/full) + excess_positive_balance + excess_prepay_installments + mixed_currency (todos bool/enum, sin importes) |
| budget_overspend_viewed | 8 | 2 | sin importe |
| budget_adjusted | 8 | 2 | solo desde guardado explícito del usuario (evita falsos positivos de UPDATEs del sistema) |
| app_error | 9 | 1 | error_code = clave i18n normalizada; instrumentación en ToastContext; throttle ~10 por código+sesión con contador acumulado |

**Fuera de Basic v1:** intención comercial (pricing/upgrade/compra) — no existen touchpoints de monetización todavía → PRD Full.

---

## 4. Fases 1–2: derivación pura (casi sin código)

### Fase 1 — Sesiones: CERO cambios
`p_app_sessions` + `usuarios.total_usage_seconds` / `last_session_at` responden todas las métricas (sesiones, días distintos, tiempo total/promedio, último uso, 7d/30d, plataforma). El tracker actual ya pausa por inactividad y recupera crashes.

### Fase 2 — Gate legal + onboarding
**Funnel 100% derivado** (cero eventos):
- inicio = `usuarios.creado_at`; gate = `consentimiento_legal_at` + versiones; abandono gate = consent NULL
- país/moneda = `p_config_region.creado_at`
- billetera principal = posición fija entre config_region y presupuestos_config
- saldo inicial set/skipped = `p_caja tipo='opening'` + metadata `initial_balance_*`
- día ancla + completado = `p_presupuestos_config.creado_at` (+ `dia_ancla_ciclo`)
- primer movimiento = `MIN(p_caja.creado_at)` excluyendo `opening`; seconds_since = diff; same_session = join temporal con `p_app_sessions`

**Único gap — opción elegida (b):** columnas `opened_terms boolean`, `opened_privacy boolean` en `usuarios` + extensión de `fn_registrar_consentimiento_legal` con `p_opened_terms`, `p_opened_privacy` (el componente captura el click en los links). Sin eventos, sin timestamps, sin relecturas.

---

## 5. Fases 4–8: derivación + eventos puntuales

### Fase 4 — Movimientos: CERO eventos
Cada fila de `p_caja` es el evento. Clasificación: **movimientos = expense + income + transfer**; `pago_tarjeta` alimenta Fase 7; `opening`/`adjustment` excluidos (sistema). `entry_source` omitido (valor constante en Basic). Borrados reducen históricos: aceptado (PRD prohíbe medirlos).

### Fase 5 — Billeteras y categorías: CERO eventos
`active_wallet_count` (p_billeteras activa), `has_used_wallet_transfer` (p_caja tipo='transfer'), límite Free (≥4), `custom_category_count` (p_estructuras_egresos, creadas post-onboarding), `distinct_categories_used` (DISTINCT p_caja.estructura_egreso_id).

### Fase 6 — Conciliación: conectar la tabla huérfana
`p_conciliaciones` existe pero NADIE la usa. **Decisión:** modificar `fn_ejecutar_conciliacion` para que SIEMPRE inserte la fila (incluye diferencia=0, que hoy hace RETURN temprano). `had_difference` se deriva como booleano (`diferencia != 0`), el importe queda en la tabla funcional. **Sin recuperación histórica** (decisión): el análisis arranca desde la activación.

### Fase 7 — Tarjetas: 2 eventos
Derivable: active_card_count, has_card_activity, purchase_mode (`cuotas_totales>1`), mixed_currency, excedentes (p_pagos_tarjeta_log). Eventos: `card_statement_viewed` y `card_payment_completed` (la intención mínimo/parcial/total no queda en la base; la calcula el modal al momento).

### Fase 8 — Presupuesto: 2 eventos
Derivable: budget_created + modo, budget_coverage_ratio, budget_used_next_cycle, sesiones de consulta. Eventos: `budget_overspend_viewed` y `budget_adjusted` (decisión (b): la base no distingue UPDATE de usuario vs sistema).

### Fase 9 — Errores: 1 evento
`app_error` con código i18n normalizado (el formato `{"key": ...}` de las RPCs ya garantiza sanitización). Instrumentación única en `ToastContext`. Throttle client-side. Sin alertas automáticas.

---

## 6. Fase 10 — CPS, retención, análisis

### 6.1. `p_telemetry_user_metrics` (tabla nueva, refresco diario pg_cron)
Consolida en una fila por usuario: active_days_7d/30d, movement_days_30d, sesiones/tiempo, active_wallet_count, custom_category_count, distinct_categories_used, reconciliation_count, days_since_last_reconciliation, active_card_count, has_card_activity, budget_coverage_ratio, budget_used_next_cycle, uso de módulos (desde eventos).

### 6.2. CPS `cps_basic_v1` (0–100, jerarquía §17.2 del PRD)

| Señal | Peso aprox. |
|---|---|
| Frecuencia + movement_days_30d (muy alto) | ~40 |
| Tarjetas (medio-alto) | ~20 |
| Presupuesto (medio-alto) | ~20 |
| Conciliación (medio-alto) | ~15 |
| Billeteras + categorías (medio-bajo) | ~10 |
| Antigüedad | 0 |

- Pesos y cortes en `app_global_config` (configurables sin redeploy)
- Categorías: Bajo / Medio / Alto / High Potential / Very High Potential
- Snapshot semanal versionado en `p_telemetry_cps_snapshots` (score_value, score_version, calculated_at, categoría)
- Nunca reinterpretar histórico: fórmula nueva → versión nueva

### 6.3. Retención y cohortes
D7/D30/D60/D90, acceso vs uso real, cohortes mensuales — **derivables on-demand** de `p_app_sessions` + `p_caja` vía RPCs de reporte, sin almacenar nada extra.

### 6.4. Intención comercial
Fuera de Basic v1 (no hay touchpoints de monetización). Eventos y su análisis van al PRD Full. CPS v1 se lanza sin esa señal.

---

## 7. ORD Admin (bloque B — planificación aparte)

App web independiente (`admin.ordcapital.com`), acceso restringido:
- 9 reportes (§19): resumen, onboarding funnel, uso, home/navegación, funciones, retención, potencial, errores, usuarios
- Ficha individual (§20): hitos y CPS, **sin saldos ni importes**
- Filtros por app_version / plataforma / plan / cohorte
- Patrón de RPCs admin: service_role (como `fn_clonar_usuario_admin`); auditoría en `admin_audit_log`
- Se planifica en detalle cuando se apruebe e implemente el bloque A

---

## 8. Lote de cambios en Supabase (requiere autorización explícita)

1. **Tabla** `p_telemetry_events`
2. **RPC** `fn_telemetry_ingest(jsonb)` — nueva
3. **Columnas** `opened_terms`, `opened_privacy` en `usuarios` + **modificación** `fn_registrar_consentimiento_legal`
4. **Columna** `created_at` en `p_billeteras` (DEFAULT now(); las 2 billeteras iniciales de cada usuario se retro-llenan con la fecha de onboarding)
5. **Modificación** `fn_ejecutar_conciliacion` — insertar siempre en `p_conciliaciones`
6. **Tablas** `p_telemetry_user_metrics`, `p_telemetry_cps_snapshots` + RPCs de refresco/snapshot + jobs `pg_cron` (diario + semanal)

Toda RPC nueva se registra en `funcionesSQL/` (espejo) y en `start_info/indice de funciones.md`.

---

## 9. Implementación por tandas (propuesta)

| Tanda | Contenido | Requiere Supabase |
|---|---|---|
| 1. Infraestructura | p_telemetry_events + fn_telemetry_ingest + TelemetryService (cola/batching/flush) + instrumentación F3 (router + HomePage) | Sí (1) |
| 2. Legal + onboarding | opened_terms/opened_privacy + extensión RPC + derivación funnel | Sí (3, 4) |
| 3. Conciliación | modificación fn_ejecutar_conciliacion | Sí (5) |
| 4. Tarjetas + presupuesto + errores | eventos F7/F8/F9 | No |
| 5. Motor CPS | tablas + RPCs + pg_cron | Sí (2, 6) |
| 6. ORD Admin | bloque B, planificación aparte | — |

Cada tanda se verifica con test transaccional (regla TDD: runner SQL con ROLLBACK, borrado al terminar).