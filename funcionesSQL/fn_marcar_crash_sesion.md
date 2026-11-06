# fn_marcar_crash_sesion

**Espejo creado:** 2026-10-01 (redefinida L1) · **Estado:** desplegada y verificada
**Repo fuente canonica:** `ord-admin/admin/sql/telemetria/fase_c_l1_sesiones_status.sql`
(antes: huerfana en Supabase, sin archivo fuente en ningun repo)

## Firma

```sql
public.fn_marcar_crash_sesion(p_session_id uuid) RETURNS void
```

Llamada por el cliente (Personal `useSessionTracker.startSession`) cuando encuentra
una sesion anterior sin cerrar en localStorage. **Nombre y firma intactos a
proposito: el codigo del cliente no se toca.**

## Que hace (L1, desde 2026-10-01)

Gate auth.uid() -> usuarios. Busca la sesion si sigue active/paused. Dos ramas:

- **Vio el background antes de morir** (status paused, o paused_at no null, o
  total_active_seconds > 0 — el tiempo solo se acumula al pausar):
  -> status `'completed'` (cierre normal sin senal de cierre).
- **Murio en foreground sin ninguna evidencia** (active, nunca pausada, sin
  tiempo): -> status `'posible_crash'` = **heuristica L1**, candidato a crash
  real; incluye cierres ultrarrapidos y refresh de desarrollo. L2 (heartbeat +
  captura de errores) lo confirmaria.

Antes de este cambio marcaba TODO como `'crashed'`: 2187/2193 sesiones eran
'crashed' mintiendo (el 99.4%). Reetiquetado historico con la misma regla:
852 -> completed, 1359 -> posible_crash, 0 crashed. El CHECK de
p_app_sessions.status se amplió con 'posible_crash' (mantiene 'crashed' solo
por reversibilidad; ninguna funcion nueva lo escribe).

## Verificacion hecha (2026-10-01)

- dry-run BEGIN/ROLLBACK de constraint + reetiquetado antes de ejecutar ✔
- post-deploy: 1359 posible_crash / 852 completed / 8 active / 5 paused / 0 crashed ✔
- fn_resumen_uso_app (misma tanda) respondia 400 por bug PREEXISTENTE de
  casting numeric->double precision; corregido con ::double precision (no la
  llama nada en el src actual de la app — por eso estaba rota y nadie lo sabia) ✔
