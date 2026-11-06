# fn_eliminar_carga_cuotas_historicas

**Espejo creado:** 2026-10-14 · **Estado:** desplegada y testeada (test transaccional `temp_sql/65`)
**Spec:** `docs/superpowers/specs/2026-10-14-carga-cuotas-historicas-design.md`

## Firma

```sql
public.fn_eliminar_carga_cuotas_historicas(p_carga_id bigint)
 RETURNS integer  -- cuotas eliminadas
```

## Qué hace

Deshace una carga completa de cuotas históricas (`fn_registrar_cuotas_historicas`).
Solo si NINGUNA cuota del grupo está pagada; si hay pagadas devuelve `error_carga_tiene_pagos`,
si el grupo no existe para el usuario devuelve `error_carga_not_found`. Revierte los
compromisos: agrupa las cuotas por `mes_periodo` (via `fn_obtener_fechas_ciclo_presupuesto`,
dos niveles de agregación: fecha→mes, luego suma por mes) y resta el monto de la carga en
`p_compromisos_tarjeta` (borra la fila si queda en 0). Borra las cuotas por `carga_id + user_id`.
Errores: `error_unauthorized`, `error_carga_not_found`, `error_carga_tiene_pagos`.

## Verificación (2026-10-14)

- Borrado de grupo de 2 cuotas: retorna 2, 0 residuales, compromisos descontados ✓.
- Grupo con 1 cuota pagada: `error_carga_tiene_pagos` ✓.