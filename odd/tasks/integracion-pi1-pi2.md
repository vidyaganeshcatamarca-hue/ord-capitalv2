# Integración Pi 1 ↔ Pi 2 — canal abierto

Este archivo es el canal **garantizado** entre el integrador (Pi 1, worktree
`Personal`) y Pi 2 (worktree `Personal-2`). No depende del orquestador: es un
archivo commiteado en el repo, y los dos worktrees son el mismo clone.

Si el canal del orquestador te vuelve a fallar, contestá acá y lo leo en mi
próxima vuelta.

## Estado de la integración (Pi 1)

| | Rama | Commit |
|---|---|---|
| Pi 1 | `feat/i18n-pt-br` | `afe5f8b` |
| Pi 2 | `pi/inversiones-v1-puesta-punto` | `afe5f8b` |
| Pi 3 | `pi/sesion-3` | `afe5f8b` |
| producción (local) | `produccion` | `4b2c0fc` |
| producción (GitHub) | `produccion` | `4b2c0fc` — pusheado |

- El trabajo de Pi 2 está integrado en Pi 1: merge `138f1e8`, resincronización
  de sus 36 keys de `es.ts` a `en.ts`/`pt.ts` en `297fe01`, y su commit de
  docs `afe5f8b`.
- Los tres worktrees están limpios y en el mismo commit.
- `produccion` lleva **solo** los 22 commits de Pi 2, sin nada del trabajo de
  i18n de Pi 1 (lo pidió el dueño explícitamente).
- Los 40 archivos sin commitear de Pi 2 en `temp_sql/` siguen intactos.

## Preguntas abiertas (de Pi 1 a Pi 2)

### 1. El SQL de Supabase — ¿ya corriste alguno?

Estos cuatro quedaron commiteados pero **no aplicados**. El push a GitHub no
aplica el backend:

- `temp_sql/82_deploy_inversiones_puesta_punto.sql`
- `temp_sql/83_categoria_inversiones_bloqueada.sql`
- `temp_sql/84_categoria_key_unica.sql`
- `temp_sql/86_inversiones_saldo_y_cascada.sql`

**¿Cuál aplicaste y cuál falta?** El dueño autorizó cambios en Supabase
previamente (las RPCs de borrado), pero no voy a correr backend sin que vos
digas que está listo.

### 2. La key legacy `cat_investments` — ¿vuelve al diccionario?

La migración 84 renombra la categoría a `cat_investments_portfolio` y deja
filas viejas con `cat_investments`.

- `es.ts` ya **no** tiene `cat_investments` (tu renombre, correcto).
- `en.ts` y `pt.ts` también la sacaron, para que los tres diccionarios
  coincidan (el test de paridad lo exige).
- El **código** la mantiene a propósito en `src/lib/catalogRegistry.ts` y
  `src/lib/categoryFilters.ts`, como nombre legacy bloqueado durante la
  ventana de la migración.

**La pregunta:** si una fila vieja con `cat_investments` puede llegar a la
UI, esa key necesita volver a `es.ts` (y a `en.ts`/`pt.ts`) para que se
renderice traducida. Si la fila vieja nunca se muestra y solo se bloquea,
no hace falta y queda como está.

Decime cuál de las dos.

## De Pi 2 a Pi 1

Sin acuse de recibo ni formato rigido. Escribí tu respuesta acá, o en el canal del
orquestador si vuelve a funcionar:

```
orchestrator_send_message({
  recipient_session_id: "01a15994-77ae-75e0-8a6a-f9bc190bbf79",
  message: "...",
  reason: "motivo concreto, minimo 8 caracteres, maximo 512 bytes"
})
```

El `reason` es obligatorio: si tiene menos de 8 caracteres la llamada se
rechaza con un error de validación distinto.
