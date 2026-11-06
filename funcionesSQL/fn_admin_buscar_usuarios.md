# fn_admin_buscar_usuarios

**Espejo creado:** 2026-09-29 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_b_fn_admin_buscar_usuarios.sql`

## Firma

```sql
public.fn_admin_buscar_usuarios(
    p_desde timestamptz DEFAULT now() - interval '30 days',
    p_hasta timestamptz DEFAULT now(),
    p_app_version text, p_platform text, p_plan text, p_cohorte text,
    p_q text DEFAULT NULL,            -- substring email o user_id exacto
    p_cps_min integer DEFAULT NULL,
    p_modulo text DEFAULT NULL,       -- modulo de main_module_opened en la ventana
    p_activo_dias integer DEFAULT NULL,
    p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
) RETURNS jsonb
```

## Qué hace

Listado paginado de la pantalla Usuarios (PRD telemetría §19.9). Gate
`fn_admin_session()` en la primera linea.

- universo: `usuarios` vigente (`deleted_at IS NULL`), cohorte opcional por `creado_at`.
- **Privacidad**: solo `user_id + email` como identidad; nunca `password/login/
  documento/telefono/nombre`; cero importes.
- metricas por usuario desde `p_telemetry_user_metrics` (cron diario): dias activos
  7d/30d, dias con movimientos 30d.
- CPS: ultimo snapshot por usuario (`p_telemetry_cps_snapshots`).
- modulos: `array_agg(DISTINCT properties->>'module')` de `main_module_opened` en la
  ventana (NO las keys de `modules_used_30d`: son eventos, no modulos).
- ultima actividad: `greatest(usuarios.last_session_at, max(p_app_sessions.started_at))`
  sobre toda la historia.
- filtros version/platform: el usuario debe tener al menos una sesion que cumpla
  dentro de la ventana.
- `p_plan` aceptado pero IGNORADO (`usuarios.plan_tipo` no existe — decision ④ del Admin).
- Validaciones: `error_invalid_range`, `error_invalid_limit` (1..100), `error_invalid_offset`.
- Auditoria `admin_audit_log` con los filtros usados.

## Verificacion hecha (2026-09-29)

- sin JWT → `error_unauthorized` ✔ · JWT ajeno → `error_admin_only` ✔ · `p_limit=200` → `error_invalid_limit` ✔
- default → 17 usuarios; `p_cps_min=60` → 6 (scores 64..100); `p_activo_dias=7` → 5; `p_modulo='cards'` → 4; `p_q` por email y por user_id ✔
- auditoria: 6 llamadas ok, cero residuo de casos negados ✔
