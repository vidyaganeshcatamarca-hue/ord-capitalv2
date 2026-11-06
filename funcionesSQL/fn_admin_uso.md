# fn_admin_uso

**Espejo creado:** 2026-09-30 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_c_fn_admin_uso.sql`

## Firma

```sql
public.fn_admin_uso(
    p_desde timestamptz DEFAULT now() - interval '30 days',
    p_hasta timestamptz DEFAULT now(),
    p_app_version text, p_platform text, p_plan text
) RETURNS jsonb
```

## Que hace

Pantalla Uso (PRD telemetria §19.3). Preguntas §28: 2,3,4,12. Gate
fn_admin_session() primera linea.

- total: sesiones, usuarios activos, dias con sesion, segundos totales y
  promedio por sesion, movimientos / usuarios con movimiento / dias con
  movimiento (p_caja tipo IN expense/income/transfer — definicion del motor
  de metrics).
- **sesiones_posible_crash + sesiones_posible_crash_pct** (renombradas el
  2026-10-01): antes 'sesiones_crashed' era falso (99%% de las sesiones marcadas
  crashed). L1 las reclasifica por evidencia de background. Ver
  funcionesSQL/fn_marcar_crash_sesion.md.
- por_dia: serie diaria (dia, sesiones, usuarios, segundos, movimientos,
  usuarios_con_movimiento) para la grafica de la pantalla.
- por_plataforma: hoy solo 'web'.
- p_plan reservado (plan_tipo no existe — decision ④).

## Verificacion hecha (2026-09-30)

- sin JWT → error_unauthorized ✔ · JWT real → 200: 1076 sesiones / 10 activos /
  437 movimientos / 31 dias en serie / crashed 99.1% ✔
