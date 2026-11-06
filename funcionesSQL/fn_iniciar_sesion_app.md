# fn_iniciar_sesion_app

**Espejo creado:** 2026-10-01 (redefinida L1) · **Estado:** desplegada y verificada
**Fuente canonica:** `ord-admin/admin/sql/telemetria/l1_fn_iniciar_sesion_app.sql`

## Firma

```sql
public.fn_iniciar_sesion_app(p_platform text DEFAULT 'web', p_app_version text DEFAULT NULL) RETURNS uuid
```

Llamada por el cliente al montar (`useSessionTracker.startSession`). Gate
auth.uid() -> usuarios.

## Que hace

1. Suma los `total_active_seconds` de sesiones previas active/paused al
   `usuarios.total_usage_seconds` (recuperacion) y actualiza `last_session_at`.
2. Cierra las previas con la **regla L1** (igual que fn_marcar_crash_sesion):
   evidencia de background (paused / paused_at / tiempo>0) -> `completed`;
   sin evidencia -> `posible_crash`.
   **Antes las marcaba todas `crashed` a ciegas** — era el segundo escritor de
   crashed que seguia generando filas falsas despues del parche de
   fn_marcar_crash_sesion (13 filas nuevas en horas, verificado 01/10).
3. Inserta la sesion nueva `active` y devuelve su uuid.

## Estado de datos post-deploy (01/10)

2225 completed / 7 active / 6 paused / **0 crashed / 0 posible_crash**.
Baseline cero decidido por el usuario: todo lo pre-L1 paso a completed; desde
ahora cada posible_crash que aparezca es real-post-regla.
