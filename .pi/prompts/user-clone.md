---
description: Clona el escenario financiero de un usuario origen sobre un destino en whitelist (solo tooling QA, no producto)
argument-hint: "<user_id_origen> [--destino <user_id>] | --help | --history <N>"
---

# /user-clone

Este comando ejecuta tooling QA que clona el escenario financiero de un usuario sobre un destino en whitelist, para reproducir bugs. **NO es parte del producto.** Solo invoca un CLI existente y un runner de tests transaccional — no edita el schema de Supabase, no commitea, no pushea.

## CONTEXT

- **Root autoritativo.** Resolvé con `git rev-parse --show-toplevel 2>/dev/null || pwd`. Según desde dónde se invoque, el worktree del tooling está en una de estas rutas, en este orden:
  1. `<root>/.worktrees/clone-user/`
  2. `<root>/../Personal/.worktrees/clone-user/`
  3. `C:/temp/Antigravity/ORD Capital v2/Personal/.worktrees/clone-user/` (absoluta, último recurso)

  Si ya sabés que el CLI no existe en ninguna, **STOP** y decile al dueño que corra el setup del spec primero — **NO** crees el worktree vos. El worktree puede estar fuera del root de la sesión actual: está autorizado por este comando, y solo para leer/ejecutar. Nunca escribas en `Personal/`.
- **Usuario origen**: el primer argumento después de `/user-clone`. Tratalo como `bigint` `user_id` de `public.usuarios`.
- **Destino**: por defecto `user_id` 20 (sandbox permanente de QA). El dueño puede pisarlo con `--destino <user_id>`. Solo se aceptan destinos de la whitelist `public.admin_clone_destinos_permitidos`; la RPC rechaza todo lo demás con `error_clone_destino_no_permitido`.
- **Rutas del tooling** (relativas al worktree resuelto):
  - CLI: `tests/admin/clone_user.py` (Python, corre con `C:/temp/miniconda3/python.exe -u`)
  - Runner de tests: `tests/admin/run_clone_user_test.py` (mismo intérprete)
- Todos los secretos viven en `.env.local` (ya copiado al worktree). No lo leas ni lo imprimas. No edites `.env.local` ni ningún `.gitignore`.

## TASK

0. **Modo ayuda primero**. Inspeccioná `$ARGUMENTS`. Si es exactamente `--help`, `--?`, o `-h` (con whitespace opcional alrededor y nada más después), imprimí el bloque HELP de abajo verbatim, agregá una línea final recordándole al dueño que para habilitar destinos nuevos los tiene que agregar a mano en la tabla whitelist de Supabase (`public.admin_clone_destinos_permitidos`) porque vos nunca la tocás, y **STOP**. No corras nada más, no preguntes, no verifiques precondiciones.
   - Regla de detección (en orden):
     1. Sacá whitespace líder y final de `$ARGUMENTS`.
     2. Si el valor recortado es igual a `--help`, `--?`, o `-h`, es modo ayuda.
     3. Si no, seguí al TASK 1 con el `$ARGUMENTS` original.
1. Verificá precondiciones antes de correr nada destructivo:
   - El worktree `.worktrees/clone-user/` existe (según el orden de resolución de arriba). Si no, **STOP** con un mensaje claro.
   - El intérprete existe en `C:/temp/miniconda3/python.exe`. Si no, **STOP**.
   - El archivo `<worktree>/.env.local` existe. Si no, **STOP**.
   - El dueño pasó un user id origen numérico como primer argumento. Si no, preguntá **una sola** cosa (el user id origen) y **STOP**.
   - Si pasó `--destino <X>` después del id origen, parsealo. Si no, el destino es 20. Decile al dueño qué destino se va a usar antes de cualquier confirmación.
2. **Siempre empezá con `--dry-run --yes`**. Nunca invoques el clon real sin un dry-run antes.
   ```
   "C:/temp/miniconda3/python.exe" -u tests/admin/clone_user.py --origen <id> --destino <dest> --dry-run --yes
   ```
   (corré con `cwd` = el worktree resuelto). Mostrale al dueño el resumen pre-flight (conteo de filas por tabla + total + estado del destino en la whitelist) y el jsonb del dry-run.
3. Después del dry-run, mostrá el resumen pre-flight y pedí **exactamente una confirmación explícita sí/no** antes de seguir. No asumas que sí. La respuesta por defecto es no.
4. Si el dueño confirma:
   ```
   "C:/temp/miniconda3/python.exe" -u tests/admin/clone_user.py --origen <id> --destino <dest> --yes
   ```
   Mostrá el jsonb completo y la línea final `[OK] inserts=... deletes=... audit_id=...`.
5. Si la RPC devuelve `error_clone_destino_no_permitido`, decile claro: "el destino {X} no está en la whitelist; agregalo vos en Supabase (INSERT INTO public.admin_clone_destinos_permitidos) si querés habilitarlo". **NO** intentes agregarlo vos. **NO** reintentes con otro destino.
6. Si cualquier otra cosa devuelve `ok: false`, mostrá `error_key` y `error_params`, no reintentes automáticamente. Preguntale al dueño cómo seguir.
   - **Skip-interactive-warning**: sin TTY el CLI se cuelga en el prompt de doble confirmación (no hay stdin). En ese caso, decile al dueño que lo corra él mismo en su terminal PowerShell, u ofrecé agregar `--force-confirm` para saltear el prompt (con la advertencia explícita de que eso saltea la red de seguridad).
7. Ofrecele al dueño la opción de ver también `--history 10` (últimos clones del `admin_audit_log`). Solo corrélo si lo pide.
8. Opcionalmente, si el dueño pide un chequeo de regresión, corré la suite transaccional:
   ```
   "C:/temp/miniconda3/python.exe" -u tests/admin/run_clone_user_test.py
   ```
   Esperá `ALL TESTS PASSED (rolled back, no data persisted)`. Si algún test falla, mostrá la aserción fallida y **STOP**.

## HELP (imprimí verbatim cuando detectes --help / --? / -h)

```
/user-clone --help                            -> muestra esta ayuda y termina. No ejecuta nada.

USO:
  /user-clone <user_id_origen>                              -> destino default = 20 (sandbox).
  /user-clone <user_id_origen> --destino <user_id>          -> destino custom.

OPCIONES:
  (sin flag)              destino = 20. Es el sandbox permanente de QA.
  --destino <user_id>     destino custom. Si NO es 20, exige doble confirmacion
                          interactiva antes de ejecutar. El destino debe estar
                          en la whitelist de Supabase (ver AGREGAR DESTINOS).

FLAGS DEL COMANDO:
  --help, --?, -h         muestra esta ayuda y termina. No ejecuta nada.
  --history <N>           muestra los ultimos N clones del audit log de Supabase
                          y termina. No ejecuta nada.

FLAGS DEL CLI (clone_user.py):
  --dry-run               simula sin tocar datos. Siempre corre primero.
  --yes                   skipea la confirmacion simple del CLI.
  --force-confirm         skipea la DOBLE confirmacion cuando --destino != 20.
                          USAR CON CUIDADO: borra datos del destino directo.

COMPORTAMIENTO (cuando invocas sin --help ni --history):
  1. dry-run automatico (no toca nada, solo muestra que haria).
  2. una confirmacion antes de ejecutar real.
  3. ejecuta la clonacion. La RPC devuelve jsonb con metricas.

AGREGAR DESTINOS A LA WHITELIST:
  La RPC solo acepta destinos que esten en la whitelist de Supabase. Para
  agregar uno nuevo, vos lo haces manualmente desde el SQL Editor. El agente
  y el CLI NO tocan esta tabla.

  Agregar un destino:
    INSERT INTO public.admin_clone_destinos_permitidos
        (destino_user_id, descripcion, agregado_por)
    VALUES
        (<user_id>, '<motivo>', '<tu_email>');

  Deshabilitar temporalmente:
    UPDATE public.admin_clone_destinos_permitidos
       SET habilitado = false
     WHERE destino_user_id = <user_id>;

  Ver la whitelist actual:
    SELECT * FROM public.admin_clone_destinos_permitidos ORDER BY destino_user_id;

ARCHIVOS INVOLUCRADOS:
  CLI (invocado por este comando):
    .worktrees/clone-user/tests/admin/clone_user.py
  Suite de tests transaccionales:
    .worktrees/clone-user/tests/admin/run_clone_user_test.py
  Espejo SQL de la RPC:
    .worktrees/clone-user/funcionesSQL/fn_clonar_usuario_admin.md
  Espejo SQL de la whitelist:
    .worktrees/clone-user/funcionesSQL/admin_clone_destinos_permitidos.md

NOTA: este comando NO es parte del producto. Es tooling admin/QA para
      reproducir bugs sobre escenarios clonados. Solo service_role puede
      ejecutar la RPC. El agente NO modifica la RPC ni la whitelist.
```

## HARD RULES

- **DO NOT MODIFY THE RPC `fn_clonar_usuario_admin`.** Esto incluye (lista cerrada, sin ambigüedad):
  - Nada de `CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION`, `DROP FUNCTION` sobre ella.
  - Nada de crear RPCs auxiliares (`fn_clonar_usuario_admin_v2`, `fn_clone_test`, etc.) que salteen la whitelist.
  - Nada de agregar o quitar entradas de la whitelist dentro del cuerpo de la RPC (la whitelist vive en la tabla, no en la RPC).
- **DO NOT MODIFY THE TABLE `admin_clone_destinos_permitidos`.** Podés hacer SELECT para chequear si un destino está permitido, pero NO podés INSERT, UPDATE ni DELETE filas. Agregar un destino es responsabilidad del dueño desde el SQL Editor de Supabase con autorización explícita.
- **DO NOT MODIFY THE TABLE `admin_audit_log`.** Read-only.
- No commitees, ni pushees, ni merges, ni rebasees. Todo el trabajo queda local.
- No toques el directorio `Personal/` más allá del worktree `clone-user`. Sus otras ramas/worktrees pertenecen a sesiones paralelas.
- No modifiques `.gitignore`, `.env.local`, ni ningún archivo de secretos.
- No le preguntes al dueño por el destino cuando es el default 20. Es un sandbox permanente; nunca pidas confirmación sobre sus datos.
- Cuando `--destino != 20`, el CLI ya fuerza doble confirmación. No la saltees pasando flags extra. Sí podés pasar `--yes` para saltear la simple, pero la doble la maneja el CLI internamente.
- No reintentes automáticamente ante un fallo. Surfaceá el error y esperá.
- No corras más de un dry-run sin una confirmación explícita entre medio.
- No finjas que el clon salió bien si `ok` no es `true` en el jsonb.
- Si ves `error_clone_destino_no_permitido` para un destino que el dueño pidió, no inventes una alternativa. Decile que el destino tiene que agregarse a mano en la whitelist.
- Respondé en el idioma del dueño (español rioplatense con voseo si es español, inglés si no). Los artefactos (salidas jsonb, audit ids) quedan en su formato original.
- Cuando la sesión termine, la próxima tiene que encontrar todo vía `tests/admin/clone_user.py` — no crees entry points alternativos.

## DELIVERY

- Arrancá con la respuesta mínima útil: una línea confirmando que las precondiciones están OK (o el blocker). Decí el destino explícitamente.
- Mostrá la salida del dry-run verbatim.
- Hacé la única pregunta de confirmación. **STOP** y esperá.
- Después de la confirmación, mostrá la salida del run real verbatim y la línea de resumen final.
- Si el dueño quiere historial, corrélo y mostrá la tabla.
- Si quiere tests, corrélos y reportá PASS/FAIL.
- No editorialices el resultado. El jsonb es la fuente de verdad.
