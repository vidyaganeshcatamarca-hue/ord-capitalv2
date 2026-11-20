# Cierre de ciclo — pantalla del ciclo cerrado (Bloque D, 2 A)

Feature: ver un ciclo cerrado con sus importes congelados y no poder tocarlo desde la pantalla.
Estado: el servidor está desplegado y verificado; falta la pantalla.
Rama: `fix/ronda-14-bugs-presupuesto-cuarentena`. Nada se publica sin orden del dueño.

## Specs

S1 — Textual del dueño: «Cuando el usuario consulte un ciclo cerrado, debe visualizar los
importes presupuestarios almacenados al momento del cierre, no valores recalculados utilizando
gastos o asignaciones modificados posteriormente.»

S2 — Textual: «Identificar claramente que el ciclo está cerrado.»

S3 — Textual: «Impedir acciones de asignación, transferencia y modificación de techos sobre ese
ciclo.» y «Mantener la protección equivalente del lado del servidor.»

S4 — Textual: «Funcionar correctamente en escritorio y móvil.»

S5 — Textual: «No alteres los movimientos financieros históricos para conseguir que la pantalla
coincida con el cierre.»

S6 — Textual: «Si el registro congelado no contiene algún dato que la interfaz necesita, evaluá
cómo incorporarlo al contrato del cierre sin inventar valores históricos ni reescribir
información ya cerrada.»

## Servidor ya desplegado (no volver a inventarlo)

- `fn_cerrar_ciclos_pendientes(p_hasta date DEFAULT NULL)` → jsonb `{ok, desde, hasta, cerrados,
  ya_estaban, no_cerrados}`. Cierra los ciclos terminados en orden. Idempotente.
- `fn_cerrar_ciclo_presupuesto(p_mes date DEFAULT NULL)` → jsonb `{cerrado, motivo, mes, inicio,
  fin, grupos, modo}`.
- `fn_reporte_cierre_ciclo(p_mes date DEFAULT NULL)` → jsonb `{mes, cerrado, ciclo, grupos:[
  {estructura_egreso_id, nombre, monto_limite, monto_gastado, saldo_cierre, detalle}]}`.
  `detalle` trae `{modo, inicio, fin, arrastre, gasto_grupo}`. Devuelve lo guardado: no recalcula.
- `fn_ciclo_esta_cerrado(p_mes date)` → boolean.
- Asignar, transferir y poner techo ya rechazan con la clave `error_budget_cycle_closed`.

## Tasks

T1 — Cambiar en `cargarDatos` la llamada `fn_cerrar_ciclo_presupuesto` por
`fn_cerrar_ciclos_pendientes` (sin parámetros), dentro del mismo `try/catch`. Commit propio.

T2 — Leer el estado del ciclo visible: al cargar, llamar `fn_reporte_cierre_ciclo` con el mes que
la pantalla está mostrando y guardar `{cerrado, grupos}`. Si el ciclo está cerrado, mostrar un
aviso claro arriba de la lista (S2) y pintar los importes de cada grupo desde `grupos`
(`monto_limite`, `monto_gastado`, `saldo_cierre`) en lugar de los del reporte vivo (S1). Los
grupos que el cierre no tenga se muestran con sus importes en cero, nunca inventados (S6).

T3 — Con el ciclo cerrado: deshabilitar el botón de asignar de cada fila, el editor de monto y
el de tope, y la entrada a transferir; el servidor ya los rechaza (S3). Nada de ocultar la
información: se ve, no se edita.

T4 — Claves nuevas en `es.ts`, `en.ts`, `pt.ts` (nunca texto incrustado). Cerrar con
`npm run i18n:ledger -- build` y luego `check`.

T5 — Pruebas estáticas en `tests/presupuestos/cierre-de-ciclo.test.js`: la pantalla llama a
`fn_cerrar_ciclos_pendientes`, lee `fn_reporte_cierre_ciclo` y deshabilita asignar/tope cuando el
ciclo está cerrado. `npx tsc --noEmit` y `node --test tests/presupuestos/*.test.js` en verde.

T6 — Ver en móvil 390 px con un ciclo cerrado real (crear el escenario en la cuenta 1, marcado
como prueba) y dejar captura. Si la ventana está minimizada, restaurarla con
`node "C:\Users\Vidya Ganesh\.pi\agent\packages\pi-ego-win\scripts\ensure-ego.mjs" --restore`.

## Log

L1 — El dueño aprobó 1 A, 2 A y 3 A el 20/11/2026: cerrar pendientes automáticamente, mostrar la
lectura histórica ahora, y después el Bloque E.

T7 — (20/11/2026) El cierre guarda ahora una fila por subcategoría con su gasto del ciclo y su
techo (`monto_techo` NULL = sin techo). `fn_reporte_cierre_ciclo` devuelve `hijos` por grupo y
`desglose` por fila. En la pantalla: dentro de un ciclo cerrado, cada subcategoría muestra su
gasto congelado y su techo congelado (o «sin techo»); si `desglose` es false (cierres anteriores
al 20/11/2026) se dice «información no disponible», nunca cero.
