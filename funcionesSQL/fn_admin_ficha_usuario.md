# fn_admin_ficha_usuario

**Espejo creado:** 2026-09-29 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_b_fn_admin_ficha_usuario.sql`

## Firma

```sql
public.fn_admin_ficha_usuario(
    p_user_id bigint,
    p_desde timestamptz DEFAULT now() - interval '30 days',
    p_hasta timestamptz DEFAULT now()
) RETURNS jsonb
```

## Qué hace

Ficha individual de comportamiento (PRD telemetría §20). Gate fn_admin_session()
primera línea. Errores: `error_invalid_user`, `error_user_not_found` (no distingue
baja real para no exponer el estado de cuenta).

- Bloques: identity (user_id+email+versión+modo), `plan` NULL (decisión ④),
  antigüedad, última actividad, sesiones/días con sesión en la ventana,
  días activos 7d/30d, movimientos (ventana/30d), billeteras activas,
  categorías usadas 30d, conciliación (conteo + días desde última),
  tarjetas (activas + uso_30d), presupuesto (cobertura + usado_siguiente),
  CPS (score/categoría/versión/calculado).
- **Timeline de hitos** (hitos, no clicks): alta, aceptacion_legal,
  onboarding_proxy (`p_config_region.creado_at` — el evento
  `onboarding_completed` todavía no se instrumenta), primer_movimiento
  (`min(p_caja.fecha)`), primera_tarjeta, primer_presupuesto,
  primera_conciliacion (`min(p_conciliaciones.fecha)` coalesce
  `min(p_billeteras.ultima_conciliacion_at)` — conciliar sin diferencia
  no deja fila), ultimo_uso.
- Cero importes: de `p_caja` solo cuenta y fechas.
- Auditoría: cada ficha abierta queda auditada con el `user_id` consultado.

## Verificación hecha (2026-09-29)

- sin JWT → `error_unauthorized` ✔ · NULL → `error_invalid_user` ✔ · 999999 → `error_user_not_found` ✔
- user 1 → 200: CPS 100 very_high_potential (cps_basic_v1), timeline 8 hitos,
  666 sesiones en ventana, 16 días con movimientos 30d ✔
