# fn_archivar_fuente_ingreso

Ronda bug 3 fuentes de ingreso (2026-10-02). Owner decision: archivar SIEMPRE
posible; DELETE solo sin movimientos.

## Firma
`fn_archivar_fuente_ingreso(p_producto_id bigint, p_archivar boolean) RETURNS void`

## Lógica
1. Resuelve `v_user_id` con `auth.uid()` → unauthorized si no.
2. `UPDATE p_ingresos SET activo = p_archivar WHERE producto_id AND user_id` (soft
   archive: la fuente sale de `fn_listar_categorias_ingreso` rev.2 pero conserva su
   producto_id para el histórico).
3. NOT FOUND → `error_income_source_not_found`.

## Requiere
- Columna `p_ingresos.activo boolean NOT NULL DEFAULT true` (mismo script).
- Llamada desde `IngresoModal` (CategoriasPage) con `p_archivar=false` para archivar.

## Notas
- Espejo: `funcionesSQL/fn_archivar_fuente_ingreso.md`.
- Script: `temp_sql/fuentes_archivar_eliminar.sql` (no versionar).