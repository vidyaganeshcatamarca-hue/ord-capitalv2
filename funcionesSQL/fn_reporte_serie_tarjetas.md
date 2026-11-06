# fn_reporte_serie_tarjetas

Ronda comparativa (2026-10-02): serie de USO de tarjetas por ciclo de
presupuesto para el tab Comparativa. Metriz = cuotas programadas
(p_cuotas_detalle por fecha_estimada_pago) — definido con el dueno: "uso",
no pagos.

## Firma
`fn_reporte_serie_tarjetas(p_ciclos integer DEFAULT 6) RETURNS TABLE(ciclo_index integer, fecha_inicio date, fecha_fin date, tarjeta_id bigint, nombre_tarjeta text, total_ciclo numeric)`

## Lógica
- CTE RECURSIVE camina hacia atras los ciclos con
  `fn_obtener_fechas_ciclo_presupuesto(fi - 10)` (mismo patron que
  `fn_reporte_comparativa_tarjetas`).
- Maximo 6 ciclos (`LEAST(COALESCE(p_ciclos,6),6)`) aunque el historial tenga mas.
- ciclo_index 0 = ciclo ACTUAL; orden de salida por tarjeta + indice.
- La suma de cuotas via subquery correlacionado (el LEFT JOIN no puede
  referenciar el lado recursivo del CTE — detalle que costo un error).

## Front
- TarjetasPage tab Comparativa: barra por ciclo con etiqueta de mes
  (es-AR short), ciclo actual resaltado (coral/verde semantico), amounts
  "Ciclo anterior → Ciclo actual" debajo, cards sin uso previo muestran
  `card_cmp_first_cycle`.

## Notas
- Espejo: `funcionesSQL/fn_reporte_serie_tarjetas.md`.
- Script: `temp_sql/reporte_serie_tarjetas.sql` (no versionar).
- Datos de prueba del dueno (user 1): compras jul/ago 2026 marcadas con
  detalle `datos_prueba` y descripcion "TEST comparativa" (7 compras,
  ~797k jul + ~759k ago). Para limpiarlas: DELETE p_cuotas por p_caja_id de
  esas compras + DELETE p_caja de esas filas.
## Media del grafico (regla del dueno, 2026-10-02/03)
- El front pide p_ciclos=12.
- GRAFICO: muestra max 6 barras (las ultimas), aunque existan mas.
- MEDIA: promedio sobre los ciclos DISPONIBLES = desde el ciclo no-cero mas
  viejo (primer uso de la tarjeta) hasta el actual, tope 12; ceros internos
  cuentan como uso cero; ceros a la cola vieja se recortan (pre-primer-uso).
