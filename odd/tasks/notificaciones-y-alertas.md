# Notificaciones y alertas — cómo funciona de verdad

**Estado:** diagnóstico cerrado, sin cambios aplicados. Queda pendiente la revisión del polling (ver al final).
**Origen:** pedido del dueño del 2026-11-10, cuando una captura desmintió la hipótesis del agente.

## Resumen en una línea

El badge de la campanita del Home **no es un sistema de notificaciones**: es un contador de filas de alerta calculadas al vuelo por `fn_reporte_alertas_home`.

## Las dos cosas que se confundían

Hay dos mecanismos distintos en el código y sólo uno está en uso.

### 1. Alertas del Home (esto es lo que el dueño ve)

- **Dónde:** `src/pages/Home/HomePage.tsx`, alrededor de la línea 1134.
- **Qué es:** un `<button>` común con el emoji 🔔. No es el componente `NotificationBell`.
- **El badge** muestra `filasVisibles.length`, o sea **la cantidad de filas de alerta**, no la cantidad de cosas.
- **Los datos** salen de `rpc('fn_reporte_alertas_home')` (HomePage, ~línea 473).
- **Descartes:** `filasVisibles` filtra las filas que el usuario descartó, guardadas en `localStorage` bajo `home_alertas_descartadas`.
- **Se refresca** cuando el Home se vuelve a montar o cambia su estado; no hay push.

Qué devuelve `fn_reporte_alertas_home`:

| Campo | Qué cuenta |
|---|---|
| `egresos_cuarentena` | filas pendientes de `p_caja_cuarentena` |
| `ingresos_cuarentena` | filas de ingreso en cuarentena |
| `billeteras_rojas` | billeteras en rojo o desconciliadas |
| `vencimientos_3_dias` | tarjetas que vencen dentro de 3 días |
| `total_alertas` | **la suma de los cuatro** |

**Ojo con la diferencia que engaña:** el badge usa la cantidad de **filas** (`filasVisibles.length`), no `total_alertas`. En la captura del dueño el badge decía 2 con filas "Cuarentena 2" y "Cuentas en rojo 4": dos filas, aunque adentro sumen seis cosas y `total_alertas` diera 8.

### 2. Notificaciones (esto NO está en uso en el Home)

- Tablas: `p_notificaciones_enviadas` y `p_notificaciones_config`.
- Lectura: `fn_obtener_notificaciones_no_leidas`, consumida por `useNotificationCount` y por el componente `NotificationBell`.
- **`p_notificaciones_enviadas` tiene 0 filas en la base viva.**
- **Ninguna función de la base inserta ahí**, en ningún esquema. Tampoco el frontend (no menciona la tabla y las policies no dejan insertar a `authenticated`).
- El único productor real son dos Edge Functions por `pg_cron`: `send-personal-reminders` (recordatorios personales, cada hora) y `daily-expenses-reminder`. Ninguna de las dos genera lo que el dueño ve.

## El caso de cuarentena: polling cada 15 segundos

`src/components/cuarentena/QuarantineHomeFab.tsx` monta un contador propio que consulta `fn_reporte_cuarentena_pendientes` cada **15 segundos** (`QUARANTINE_POLL_MS = 15000`), más una carga inicial.

Es un tercer mecanismo, independiente de los dos anteriores: es el FAB con icono de bandeja de entrada y badge que aparece sobre el Home.

## Lo que queda por revisar (pedido del dueño)

1. **El polling de 15 segundos es ineficiente** y al dueño no le gusta. Hay que proponer alternativa y explicarla: tabla de eventos con escritura en el momento, Realtime de Supabase, o un contador que sólo se refresque al volver a foco. Comparar costo y latencia.
2. **Explicar el mecanismo completo al dueño**, sin tecnicismos, con el ejemplo de la captura: por qué el badge decía 2 y no 8, y por qué "llega al instante" cuando en realidad no llega nada.
3. **Decidir qué pasa con `p_notificaciones_enviadas`**: hoy es una tabla muerta con RPC de lectura, campana y preferencias funcionando contra el vacío. O se le construye un productor, o se retira.
4. **Avisos de vencimiento de sobres** (definición 32, L12 del documento de ahorro): dependen de resolver el punto 3, porque no hay productor donde enchufarlos.
