# Barrido de español hardcodeado — app en inglés

Feature: `i18n-hardcoded-sweep` · Rama: `feat/i18n-pt-br` · Delivery: commits de unidad de trabajo, sin push · Tests: `node --test`

Objetivo: con la app en inglés, encontrar y corregir todo texto en español que
quedó hardcodeado o mal traducido. Primero las 8 pantallas reportadas por el
dueño, después un barrido de toda la app con Ego Browser.

## Specs

- **S1.** El dueño puso la app en inglés y encontró sitios donde se sigue
  viendo español. Textual: «encontré algunos sitios donde todavía estamos
  probablemente o hardcodeando español o no se han efectuado las traduc ciones
  correctamente».
- **S2.** Hay que corregir esas pantallas **y además** barrer toda la app.
  Textual: «lo que te pido es que además de corregirlo en esas pantallas,
  revises con Ego Browser y la skill de Ego Browser toda la app en busca de
  hardcodeados en español y lo corrijas».
- **S3.** Captura 1 — menú home, sección billeteras:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-f0da29dc-e2b9-483e-98cf-0ec03d8b1132.png`
- **S4.** Captura 2 — menú tarjetas:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-32af4397-440c-4f43-af6b-47ef1311434c.png`
- **S5.** Captura 3 — tarjetas, pestaña comparativa:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-97d0e4d8-7203-4f42-93d5-436302622043.png`
- **S6.** Captura 4, sin descripción del dueño:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-891e34af-86c8-4f3d-9ffd-06ee92cb3196.png`
- **S7.** Captura 5 — detalle de tarjeta:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-b513535a-9689-4b78-93fa-3c380476665b.png`
- **S8.** Captura 6, sin descripción del dueño:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-f85c4b90-f18c-45c5-8bc9-50affe86505a.png`
- **S9.** Captura 7 — menú presupuestos:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-4afa8758-b939-4081-8562-741c3027f95b.png`
- **S10.** Captura 8, sin descripción del dueño:
  `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-9cb86fce-1670-471d-9b01-1cf258a1bff4.png`
- **S11.** Toda corrección va por i18n: clave nueva en `src/locales/es.ts` + `en.ts`
  + `pt.ts`, con paridad de placeholders. Prohibido hardcodear español en el
  código fuente (regla 9 del proyecto).
- **S12.** Cada captura se lee **al empezar su tarea**, nunca en lote (regla 15
  del proyecto).

## Tasks

| ID | S# | Tarea | Ruta | Estado | Commit |
|---|---|---|---|---|---|
| T1 | S3 | Menú home, sección billeteras | inline | pendiente | — |
| T2 | S4 | Menú tarjetas | inline | pendiente | — |
| T3 | S5 | Tarjetas, pestaña comparativa | inline | pendiente | — |
| T4 | S6 | Cuarta captura (sin descripción) | inline | pendiente | — |
| T5 | S7 | Detalle de tarjeta | inline | pendiente | — |
| T6 | S8 | Sexta captura (sin descripción) | inline | pendiente | — |
| T7 | S9 | Menú presupuestos | inline | pendiente | — |
| T8 | S10 | Octava captura (sin descripción) | inline | pendiente | — |
| T9 | S2 | Barrido de toda la app con Ego Browser | inline | pendiente | — |
| T10 | S11, S12 | Verificación y commits | inline | pendiente | — |

## Log

- **L1** (pedido original, verbatim): «Estuve revisando la app, la puse en
  lenguaje inglés y encontré algunos sitios donde todavía estamos probablemente
  o hardcodeando español o no se han efectuado las traduc ciones
  correctamente. Te paso varias fotos de diferentes pantallas donde puedes
  observarlo, pero lo que te pido es que además de corregirlo en esas pantallas,
  revises con Ego Browser y la skill de Ego Browser toda la app en busca de
  hardcodeados en español y lo corrijas.»
- **L2** (2026-10-23, entorno): las 8 capturas existen en
  `C:\Users\Vidya Ganesh\AppData\Local\Temp\` (verificado, sin leer su
  contenido). El dev server responde en `http://localhost:5173/`.
