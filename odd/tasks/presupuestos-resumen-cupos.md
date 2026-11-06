# Feature: Presupuestos — Resumen de cupos config vs. real (gráfico híbrido colapsable)

Decisión del dueño (2026): Opción C — card colapsable al tope de la pantalla
de Presupuestos, debajo del header "disponible". Colapsada muestra una línea
de estado del ciclo (🟢/🟡/🔴). Expandida: mini-dona de distribución
configurada vs. real (segmentos con color de cupo, anillo interno coloreado
por estado semáforo) + 4 filas por cupo con punto de estado y % llenado.

## Fuentes de datos (decididas)

- RPC existente desempleada: `fn_reporte_termometro_presupuestos()`
  (espejo en funcionesSQL, índice #175). Sin back-end nuevo en v1.
- Mapping cupos: needs→Necesidades, wants→Deseos, tithe→Diezmo,
  savings_goal→Ahorro (unifica investment+saving).
- Umbral semáforo sobre `porcentaje_llenado`: <70 verde, 70–100 amarillo,
  >100 rojo (mismos cortes que estado_sobre en fn_reporte_sobres_detalle).
- Números de la RPC tratados con Number() defensivo (formato wire incierto).

## Tareas

- T1. Nueva card de resumen `CuposResumenCard.tsx` en
  `src/pages/Presupuestos/` (o componente propio) + CSS con tokens
  (--mint/--amber/--red, clase `verde|amarillo|rojo`). Dona compacta
  extendiendo patrón DonutChart (SVG puro, gap 2.5px) + colapso con
  transición. Fracciones de ángulo calculadas en render (geometría SVG);
  los números mostrados salen de la RPC.
- T2. Wiring en PresupuestosPage: 4ta llamada paralela en cargarDatos
  a fn_reporte_termometro_presupuestos, respetando mesOffset actual
  (la RPC usa el ciclo actual; si mesOffset ≠ 0 el card oculta o muestra
  solo ciclo corriente — decidido: visible solo en mesOffset 0).
- T3. i18n: claves budget_resumen_* en src/locales/es.ts (título, línea
  de estado por estado, leyenda ideal/real, tooltips umbral 70%).
  Gate: node scripts/check-i18n.mjs.
- T4. Estado colapsado: peor estado de los 4 cupos → texto y color de la
  línea ("Ciclo en orden" / "Cerca del límite" / "En rojo"). Persistencia
  del estado abierto/cerrado opcional fuera de scope v1.
- T5. DONE — commit d4a914d en rama feat/intermedio-gate-front
  (incluye el ajuste pendiente de es.ts, decisión del dueño).

## V2 — Cambios pedidos por el dueño (con screenshot 2026)

Decisión Ahorro: consumido de Ahorro = lo ASIGNADO a los sobres de
ahorro/inversión del ciclo (monto_limite de p_presupuestos).

- T6. DONE — RPC v2 aplicada en Supabase via Management API (owner OK)
  por el orquestador; espejo actualizado;
  SQL de referencia: temp_sql/fn_reporte_termometro_presupuestos_v2.sql
  (firma con default p_mes_periodo, back-compatible).
- T7/T8/T9. DONE — v2 front commits d4a914d/021f068/746f4ef: donut
  simple (luego reemplazado por barras en v3), colapso grid-rows
  (bug PC resuelto), memoria sessionStorage, selector de ciclo.
- T10. DONE — v3 (pedidos de 2026): donut eliminado; barras por cupo
  (verde<70, amarillo 70-100, barra completa roja si >100, % real a la
  derecha), cupos config 0% ocultos, orden desc por % configurado,
  título "Distribución de gastos {valores}". Commit 746f4ef.
  Checks v3: tsc EXIT 0; check-i18n 0 menciones; tests/sql preexistente
  falla igual sin cambios (necesita SUPABASE_SECRET_KEY, no aplica).

## Notas

- Engram mirror (odd/presupuestos-resumen-cupos/tasks): no written —
  mem_* MCP tools unavailable in this session; regla de espejo queda
  registrada aquí como deuda de memoria.
- Límite de la RPC usa ingreso promedio 90 días; deuda futura posible:
  variante basada en montos asignados reales (requiere OK del dueño).