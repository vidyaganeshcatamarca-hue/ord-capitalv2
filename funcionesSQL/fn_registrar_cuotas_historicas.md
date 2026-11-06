# fn_registrar_cuotas_historicas

**Espejo creado:** 2026-10-14 · **Estado:** desplegada y testeada (test transaccional `temp_sql/65`)
**Spec:** `docs/superpowers/specs/2026-10-14-carga-cuotas-historicas-design.md`

## Firma

```sql
public.fn_registrar_cuotas_historicas(
    p_tarjeta_id bigint,
    p_detalle text,
    p_cantidad integer,
    p_monto_cuota numeric,
    p_mes_inicio date,
    p_moneda text,
    p_estructura_egreso_id bigint DEFAULT NULL
) RETURNS bigint  -- carga_id del grupo
```

## Qué hace

Carga de cuotas pendientes de ciclos ANTERIORES (compras previas a instalar la app).
Genera N cuotas "huérfanas" en `p_cuotas_detalle` (`p_caja_id NULL` — NO crea movimiento,
porque el donut incluye gastos de tarjeta y contaminaría reportes), al `dia_vencimiento`
de la tarjeta, mes a mes desde `p_mes_inicio` (primer vencimiento, tope +24 meses).
Comparte `carga_id` (secuencia `p_cuotas_carga_seq`) para poder deshacer el grupo con
`fn_eliminar_carga_cuotas_historicas`. Inserta/suma `p_compromisos_tarjeta` por
`mes_periodo` (mismo UPSERT que `fn_registrar_gasto_tarjeta`).

- Validaciones: tarjeta activa del usuario con `dia_vencimiento`; `p_detalle` no vacío;
  cantidad 1..120; monto>0; mes entre mes actual y +24; moneda = local del usuario o USD
  (`error_currency_not_supported`).
- Errores: `error_unauthorized`, `error_card_not_found`, `error_field_required`,
  `error_invalid_cuotas`, `error_invalid_amount`, `error_invalid_first_due_month`,
  `error_currency_not_supported`.
- Clamp del día al último día del mes destino (feb/31) por robustez.
- Llamarla desde `src/pages/Tarjetas/TarjetasPage.tsx` (modal de carga histórica).

## Verificación (2026-10-14)

- Humo live: 3×1000 desde mes actual → carga_id 1, fechas 25-oct/25-nov/25-dic ✓ (rollback).
- Test transaccional: fechas exactas, USD, 4 rechazos, borrado/revertido — PASS.