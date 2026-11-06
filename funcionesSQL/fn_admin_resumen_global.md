# fn_admin_resumen_global

**Espejo creado:** 2026-09-29 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin, no la app de usuario)
**SQL fuente:** `ord-admin/admin/sql/fase_b_fn_admin_resumen_global.sql`

## Firma

```sql
public.fn_admin_resumen_global(
    p_desde        timestamptz DEFAULT now() - interval '30 days',
    p_hasta        timestamptz DEFAULT now(),
    p_app_version  text DEFAULT NULL,
    p_platform     text DEFAULT NULL,
    p_plan         text DEFAULT NULL,   -- reservado: usuarios.plan_tipo no existe aun
    p_cohorte      text DEFAULT NULL    -- 'YYYY-MM' de alta (usuarios.creado_at)
) RETURNS jsonb
```

## Que hace

Reporte agregado de la pantalla Resumen (PRD telemetra §19.1). Preguntas §28
que responde: 1, 2, 3, 4, 19, 20(conteo), 23 y 17.

1. Llama `fn_admin_session()` como gate de rol (primera linea).
2. Universo (`base`): `usuarios` con `deleted_at IS NULL`, filtrado por cohorte de alta si se pasa.
3. Metricas de ventana (`p_desde`/`p_hasta` + `p_app_version`/`p_platform`):
   activos, sesiones, dias activos, tiempo total/promedio desde `p_app_sessions`;
   modulos_top y errores_principales desde `p_telemetry_events`
   (`main_module_opened.properties->>'module'` y `app_error.properties->>'error_code'`).
4. **uso real** = distinct `user_id` en `p_caja` con `tipo IN ('expense','income','transfer')`
   — la MISMA definicion que `fn_telemetry_refresh_user_metrics` (no se inventa otra).
5. **retencion D7/D30/D60/D90** por cohorte de alta: `retenidos` = usuarios con al menos
   una sesion entre el dia N y N+6 desde `creado_at`. No usa la ventana. Cohorte
   solo cuenta usuarios con alta >= N dias.
6. **CPS**: ultimo snapshot por usuario en `p_telemetry_cps_snapshots`
   (hoy `cps_basic_v1`) → promedio, HP y Very High.
7. `high_potential_free` / `high_potential_trial` devuelven **NULL** con nota
   `plan_hp_split_not_available`: dependen de `usuarios.plan_tipo` (decision ④, pendiente,
   es de la app de usuario). `p_plan` se acepta pero se IGNORA por lo mismo.
8. Audita en `admin_audit_log` con `accion='fn_admin_resumen_global'`, `resultado='ok'`
   y los filtros usados en `parametros`.

## Seguridad

- `SECURITY DEFINER`, `search_path=public`.
- `REVOKE` para `PUBLIC` y `anon`; `GRANT EXECUTE` solo a `authenticated`.
- Sin JWT → `error_unauthorized` (via `fn_admin_session`, sin fila de auditoria).
- Identidad fuera de `admin_usuarios` → `error_admin_only` (auditoria `denied`).
- Rango invertido → `error_invalid_range`.

## Verificacion hecha (2026-09-29)

- sin JWT (Management API) → `error_unauthorized` ✔
- JWT real del admin → 200 con datos: 10 activos / 971 sesiones / 30 dias activos /
  CPS prom 44.9 / 3 HP + 2 VHP / D7 28.6% (4/14), D30 40% (4/10), D60 42.9% (3/7) ✔
- JWT ajeno (SET LOCAL claims) → `error_admin_only` ✔
- Auditoria: +2 filas (`admin_session` ok + `fn_admin_resumen_global` ok), cero residuo ✔
