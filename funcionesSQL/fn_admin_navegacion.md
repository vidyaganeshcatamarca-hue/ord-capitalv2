# fn_admin_navegacion

**Espejo creado:** 2026-09-30 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_c_fn_admin_navegacion.sql`

## Firma

```sql
public.fn_admin_navegacion(
    p_desde timestamptz DEFAULT now() - interval '30 days',
    p_hasta timestamptz DEFAULT now(),
    p_app_version text, p_platform text, p_plan text
) RETURNS jsonb
```

## Que hace

Pantalla Navegacion (PRD telemetria §19.4). Preguntas §28: 10, 11.
Gate fn_admin_session() primera linea. Solo lee p_telemetry_events.

- desde_home: main_module_opened con previous_module='home' → destinos rankeados
  (verificado: cuarentena 35, wallets 7, settings 5, cards 5...).
- transiciones: top 20 de pares origen→destino (LIMIT dentro de subquery, no del
  aggregate — LIMIT dentro de jsonb_agg es syntax error).
- modulos_por_sesion: distinct module por session_id → {sesiones 80, promedio
  2.05, maximo 8}.
- interacciones_home: home_interaction.interaction_type (filter_date,
  filter_category, filter_level, filter_wallet, donut_detail, donut_expand,
  recent_movement_open).
- correcciones_desde_home: conteos de home_movement_edited (8) / deleted (11).
- previous_module = null = entrada directa sin origen registrado (nota en meta).
- p_plan reservado (decision ④). SECURITY DEFINER, REVOKE anon, auditoria.

## Verificacion hecha (2026-09-30)

- deploy 201 · JWT real → 200 con los 5 bloques y top-20 de transiciones ✔
- nota de deploy: primera version fallo 'syntax error at or near LIMIT' —
  LIMIT no va dentro de jsonb_agg, va en el subquery del FROM ✔ corregido
