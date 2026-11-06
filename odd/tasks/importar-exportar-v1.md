# Feature: Importar/Exportar movimientos (v1) — xlsx + csv

Spec aprobada: docs/superpowers/specs/2026-10-07-importar-exportar-movimientos-design.md
Decisión clave: pipeline all-client (Approach A), cero RPC nueva en v1.
Telemetría: funil completo según definición del dueño (sección 6 de la spec),
agregado por import para row_fixed, 1+9 unidos en import_export_action.

## Tareas — ESTADO FINAL v1

- T1. DONE commit 2dba1a2 — parser.ts + 22 tests (RED/GREEN observado
  por el orquestador; allowlist .gitignore).
- T2. DONE commit d8740d6 — xlsx deps + pantalla + ruta + hub card + config_ie_*.
- T3a. DONE commit 57613f4 — schema.ts + parseWorkbook.ts + wizard file→map.
- T3b. DONE commit 27893ec — validate.ts + ReconcileStep + gate (14 tests).
- T4. DONE commit 4e58660 — execute.ts + SummaryStep + telemetría del gate
  + resumen CSV fallidas (10 tests) + schema fix: cuenta solo para expense.
- T5. DONE commit baf9a8b — export con prefs regionales + ExportPanel
  + round-trip con aliases de billetera; REMOVED monto_destino del import
  (decisión del dueño: no se aceptan transferencias multi-moneda) →
  fn_exportar_movimientos las emite como dos piernas reimportables.
- T6. DONE commit edbbe17 — import_export_action (import side) +
  card_import_export_opened. Funil §6 completo.
- T7. Checks finales: 57/57 unit tests verdes, tsc EXIT 0, check-i18n
  0 menciones (FAIL global preexistente: deuda anterior).
- RPC nueva aplicada: fn_exportar_movimientos (espejo funcionesSQL/
  fn_exportar_movimientos.md, índice #250). Sin otras RPC nuevas.

## Deuda v1 / siguiente iteración

- Export XLSX: montos como celda numérica con numFmt agnóstico del
  locale — el viewer aplica sus separadores; solo el CSV lleva los
  separadores del user literales (decisión documentada).
- Descargas móviles vía Filesystem+Share no testeadas en device
  (guarded con fallback web).
- Bulk loader RPC (volumen grande) aplazado — Approach A sostiene hasta
  ~1000 filas con inserts secuenciales.

## Notas

- Rama de trabajo: feat/intermedio-gate-front (decisión del dueño, trabajo
  directamente ahí).
- Sin funcionesSQL/ ni indice (sin cambios de backend en v1).
- Engram mirror no disponible en esta sesión (mem_* tools absent).