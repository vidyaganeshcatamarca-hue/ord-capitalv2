# fn_eliminar_fuente_ingreso

Ronda bug 3 fuentes de ingreso (2026-10-02). Owner rule: con movimientos NO se
borra (solo se archiva); sin movimientos, DELETE real.

## Firma
`fn_eliminar_fuente_ingreso(p_producto_id bigint) RETURNS void`

## Lógica
1. Resuelve `v_user_id` con `auth.uid()` → unauthorized si no.
2. Cuenta movimientos: `p_caja WHERE user_id AND cuenta_ingreso_id = p_producto_id`
   (¡la FK se llama `cuenta_ingreso_id`, NO `producto_id`!).
3. Si hay movimientos → RAISE `error_income_source_has_movements` (i18n).
4. `DELETE p_ingresos WHERE producto_id AND user_id`; NOT FOUND →
   `error_income_source_not_found`.

## Contrato con el front
- El front solo habilita el DELETE cuando `tiene_movimientos = false` (rev.2 de
  listar), pero la RPC vuelve a validar en el backend (fuente de verdad).

## Test
- Transaccional validado (ROLLBACK): crear → borrar OK; con movimiento en p_caja
  → RAISE de la key. Ver sesión 2026-10-02.

## Notas
- Espejo: `funcionesSQL/fn_eliminar_fuente_ingreso.md`.
- Script: `temp_sql/fuentes_archivar_eliminar.sql` (no versionar).