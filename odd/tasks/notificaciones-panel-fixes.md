# Notificaciones: cuatro fallos reportados por el dueño

Fuente: mensaje del dueño con dos capturas del panel de notificaciones del Home.

## Specs

**S1 — Contraste en modo claro.**
Cita literal: *"Las notificaciones en modo oscuro se ven bien, pero en modo claro no tienen contrastes."*
El panel y sus items deben leer bien en los dos temas. Evidencia: `src/components/notificaciones/NotificationItem.css:8` fija `color: #cbd5e1`, un gris pensado para fondo oscuro. Revisar también el resto de `NotificationItem.css` (`border-bottom`, `background` del icono y `:hover`, todos con `rgba()` fijos) y las clases del panel en `HomePage` (`.home-alerts-panel`, `.home-alerts-header`, `.home-alerts-title`, `.alert-item-row`, `.alert-item-label`, `.alert-item-badge`).
Regla: usar variables de tema (`var(--text)`, `var(--text-2)`, `var(--surface)`, `var(--border)` o las que el proyecto ya use en modo claro), nunca un color hexadecimal ni un `rgba()` de fondo oscuro.

**S2 — Un clic afuera debe cerrar el panel.**
Cita literal: *"Un clic afuera de la ventana de notificaciones debería cerrar la ventana, pero no la cierra, la ventana queda abierta hasta que se aprieta cerrar."*
Hoy `alertsOpen` solo cambia con el botón de la campana y con "Cerrar ✕"; no hay listener externo.
El panel se renderiza en `src/pages/Home/HomePage.tsx` dentro de `{alertsOpen && alerts && (...)}` como `.home-alerts-panel` dentro de un `.section`. No hay overlay.
Implementar cierre por `pointerdown` en `document` con `capture`, ignorando los clics dentro del panel y dentro del botón de la campana (`.home-bell-target`), y retirar el listener al cerrar. No usar `onClick` en un overlay que tape el resto de la página: el panel es un bloque en el flujo, no un modal.

**S3 — El contador del badge suma alertas y notificaciones.**
Cita literal: *"En la notificación de cuántas notificaciones hay, en el conteo, muestra las alertas. Si tengo tres alertas y cuatro notificaciones, muestra el número solo tres. En realidad debería sumar alerta más notificaciones."*
Revisar `src/hooks/useNotificationCount.ts` (70 líneas) y cómo `HomePage` compone `badgeCampanita`. El badge debe ser la suma de las filas de alerta visibles más el conteo de avisos no leídos.

**S4 — La cuarentena no puede aparecer dos veces.**
Cita literal: *"Habíamos quedado que la cuarentena no se mostraba como notificación, sino luego de 48 horas se mostraban las alertas o que habíamos quedado, ya no recuerdo bien. Ahora se están mostrando ambas y la información queda redundante. Si muestro una no puedo mostrar la otra."*
Lo ratificado en el registro es **24 h**: el FAB del Home informa al instante y el aviso solo nace si el pendiente sigue sin resolver 24 horas después.
Regla: mientras la alerta de cuarentena esté viva, **suprimir** el aviso de cuarentena del listado. La alerta es el estado vivo y trae el conteo y la navegación; el aviso queda para cuando la alerta ya no existe. No cambiar la regla de las 24 h.

**S5 — La notificación de categoría en rojo debe nombrar la categoría.**
Cita literal: *"la notificación de categoría en rojo no me está diciendo cuál es la categoría que está en rojo, ese dato es importante porque puedo tener más de una."*
El productor nunca manda texto en español: manda `tipo_notificacion` + `metadata`, y el cliente traduce con `src/lib/notificationKeys.ts` (`resolveNotifKeys`).
Primero comprobar si `metadata` **ya trae** el nombre de la categoría. Si lo trae, mostrarlo en el cliente. Si no lo trae, **no tocar la RPC**: reportar exactamente qué clave falta y qué habría que agregar en `fn_aviso_categoria_en_rojo` (toda modificación de RPC necesita autorización del dueño).

**S6 — Avisos repetidos del mismo hecho en días distintos.**
En la captura aparecen "Transacciones en cuarentena — hace 42 min" y "Transacciones en cuarentena — hace 1 días", igual con "Categoría en rojo". No son duplicados exactos: son avisos generados en corridas distintas del cron (00 y 12 UTC).
Investigar la `dedupe_key` de cada productor y reportar si un hecho sin cambios puede encolar un aviso por corrida. **No modificar ningún productor ni RPC**: reportar la causa con `path:line` y la corrección propuesta.

## Fuera de alcance

- No modificar funciones RPC ni tablas.
- No tocar `src/locales/es.ts` salvo para agregar claves nuevas que falten; nunca reescribir textos existentes.
- No commitear.

## Verificación exigida

`npx tsc --noEmit` y `npm run build`, leyendo **cada exit por separado** (imprimir `TSC_EXIT` y `BUILD_EXIT`; el exit del script compuesto no vale). Reportar el resultado textual.
