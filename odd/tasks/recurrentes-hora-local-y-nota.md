# Recurrentes: nota en cuarentena y programación en hora local

## Specs

- **S1** (punto 1, verificación) — «al darle de alta a un gasto recurrente inmediatamente se ejecute el que pone en la cola a ese gasto nuevo». El disparo existe desde `387d6ac`: `GastosRecurrentesPage.handleSubmit` llama `generarRecurrentesAhora()` después de crear o editar, sin la guarda diaria de `localStorage`, con la fecha local del cliente.
- **S2** (punto 1, hora local) — «siempre para la programación de los recurrentes usamos hora local». Ninguna función que programe recurrentes puede leer el reloj del servidor para decidir qué día es hoy. UTC queda para telemetría y para los sellos (`pausado_at`, `creado_at`).
- **S3** (punto 2) — «Cuando el gasto recurrente o el ingreso recurrente tiene un nombre que es diferente a la categoría, que ese nombre en cuarentena se ponga como detalle o como nota, por defecto. Si no tiene nombre, si el nombre del recurrente es la categoría, detalle o nota aparece vacío.»
- **S4** (autorización del dueño) — antes de dropear funciones hay que probar que la app no las llama.

## Tasks

| ID | Spec | Qué | Evidencia |
| --- | --- | --- | --- |
| T1 | S1 | Verificar el disparo inmediato del motor | `src/pages/Configuracion/GastosRecurrentesPage.tsx:183`, commit `387d6ac` en `produccion` |
| T2 | S4 | Auditar llamadores de `fn_crear_gasto_recurrente` / `fn_editar_gasto_recurrente` / `fn_generar_recurrentes_hoy` | único llamador: `src/hooks/useGastosRecurrentes.ts:29,58` (manda todos los parámetros). Ninguna función SQL las referencia. `fn_generar_recurrentes_hoy` sin llamadas (solo dos comentarios) |
| T3 | S3 | `temp_sql/171_recurrentes_detalle_desde_nombre.sql`: el motor escribe `detalle = nombre_custom` si aporta algo | test `A3`, `A4`, `A5`, `A10`, `A11` |
| T4 | S2 | `temp_sql/172_recurrentes_hora_local.sql`: `p_fecha_base` en crear/editar/reactivar, `p_hoy` en el backfill manual y DROP de las sobrecargas de la 82 | test `A1`, `A6`, `A8`, `A9`, `A12`, `A13` |
| T5 | S2 | Frontend: `src/lib/fechaLocal.ts` y paso de la fecha en crear/editar/reactivar | `npx tsc --noEmit` sin salida; params 19/19, 22/22, 4/4 contra `proargnames` |

## Log

- L1 — Pedido del dueño: «Vamos con algunas correcciones del módulo de recurrentes, algunas mejoras: 1. Cuando cargamos un gasto recurrente, este recién se va a poner en la cola cuando se abra nuevamente la aplicación. Pero quiero que verifiques si está implementado que al darle de alta a un gasto recurrente inmediatamente se ejecute el que pone en la cola a ese gasto nuevo para que no tengamos que esperar al día siguiente por si ese gasto recurrente comienza el mismo día de la carga. Verifica esto y si no está implementado así hazlo. 2. Por definición de producto, el nombre de recurrente lo ingresa el usuario. Cuando este nombre queda vacío, el nombre pasa a ser la categoría. Cuando el gasto pasa a cuarentena, en cuarentena tenemos un campo que es el campo detalle o nota que podemos agregar. Cuando el gasto recurrente o el ingreso recurrente tiene un nombre que es diferente a la categoría, que ese nombre en cuarentena se ponga como detalle o como nota, por defecto. Si no tiene nombre, si el nombre del recurrente es la categoría, detalle o nota aparece vacío.»
- L2 — Verificación de S1: el disparo inmediato **ya estaba implementado** y en producción. No se tocó.
- L3 — Hallazgo medido contra la base viva (`TimeZone = UTC`): el alta anclaba `proxima_ocurrencia` con `CURRENT_DATE` del servidor. A las 22:30 de Argentina el servidor ya está en el día siguiente y la ocurrencia de hoy se pierde: `fn_recurrente_proxima_ocurrencia('mensual', día 6, desde '2026-11-07') = 2026-12-06`. En modo `unica` con fecha hoy devuelve `NULL` y no se genera nunca.
- L4 — Prueba en rojo (`tests/sql/recurrentes_hora_local_red.sql`): con la sesión en `Pacific/Kiritimati` (UTC+14) se reproduce el desfasaje de las 22:30 de Argentina. Tres aserciones del bug, las tres cumplidas: puntero en `2026-12-06`, cero ocurrencias para hoy.
- L5 — Decisión del dueño: «B. Vamos a resolver todos los problemas, Sería bueno que los datos se tomen siempre en horario local Donde se planifican las recurrencias UTC lo estábamos usando para la telemetría... Pero siempre para la programación de los recurrentes usamos hora local».
- L6 — Decisión del dueño: «Si vas a hacer drop de funciones, asegúrate de que no son llamadas por ninguna parte de la app» → T2.
- L7 — Decisión del dueño: «solo revisa tu worktree personal-3» → los espejos se actualizaron acá; el espejo completo vive en el worktree `Personal` y queda por sincronizar.
- L8 — Aplicado en Supabase: 171 y 172. Reaplicar es idempotente. Verificado que no quedaron datos de prueba.
- L9 — Pendiente fuera de alcance: `fn_reporte_calendario_financiero` también arranca su ventana en `CURRENT_DATE`, así que entre las 21:00 y las 24:00 de Argentina el calendario empieza mañana. Es un reporte de sólo lectura, no programa nada: se deja anotado, sin tocar.
