# Feature: Modo intermedio — voz + cuarentena como extensión del modo simple

Nivel intermedio entre simple/avanzado: features `menu_cuarentena` y carga por voz
habilitadas en modo simple según la preferencia `voz_activada` (switch en Ajustes →
Preferencias operativas, default **OFF**). En modo avanzado se habilitan siempre,
switch o no. El concepto es genérico (columna `app_feature_flags.pref_key`) para el
OCR futuro (`ocr_enabled`), que hoy no persiste — deuda aparte.

- Decisiones de diseño: Engram `architecture/modo-intermedio-features` (id 489).
- Mirror Engram de tareas: `odd/modo-intermedio-voz/tasks`.
- Rama de commits del orquestador: `feat/intermedio-gate-front` (desde el HEAD de `feat/modo-intermedio-voz`). Nota: `feat/modo-intermedio-voz` terminó siendo una rama del otro agente paralelo — NO commitear ahí (decisión del dueño).

## SQL autorizado por el dueño (OK explícito 2026-*, conversación)

1. `p_preferencias_usuario.voz_activada` → default `false` + UPDATE de filas existentes.
2. `app_feature_flags` + columna `pref_key text`.
3. `menu_cuarentena` → `modo_minimo='intermedio'`, `pref_key='voz_activada'`.
4. INSERT flag `menu_carga_voz` (intermedio, misma pref_key) para el tab de voz del modal.
5. `CREATE OR REPLACE fn_obtener_modo_app()` con filtro intermedio (CASE por pref_key).
   Archivo: `temp_sql/modo_intermedio_upr.sql` vía `tests/sql/_apply_migration.js`.

## Tareas

1. **[hecha al ejecutar migración]** SQL en Supabase + verificación de flags.
2. **[pendiente]** Actualizar espejo `funcionesSQL/fn_obtener_modo_app.md` (RPC modificada, no nueva).
3. **[pendiente]** Front: `PreferenciasOperativasPage` default `voz_activada:false` + dispatch `refresh-modo-app` al toggle.
4. **[pendiente]** Front: gate del tab "Grabar por voz" en `AddMovementModal` (`hasFeature('menu_carga_voz')`).
5. **[pendiente]** Front: guard de ruta `/cuarentena` (redirige a `/` si no hay feature) + `VoiceHomeFab` sigue vía `menu_cuarentena`.
6. **[pendiente]** i18n: claves nuevas si el guard necesita texto; `node scripts/check-i18n.mjs`.
7. **[pendiente]** Checks orquestador: `npx tsc --noEmit` + `node --test "tests/**/*.test.js"`.
8. **[pendiente]** Commits por tarea (convencionales, sin atribución IA).

## Evidencia de commits

- Checks (orquestador): `npx tsc --noEmit` PASS · `node scripts/check-i18n.mjs` FAIL preexistente (249 used-not-defined, llamadas ya presentes en HEAD; cero nuevas de este feature) · `node --test` FAIL preexistente (expectativas viejas `wallets.*` en tests i18n + runner SQL ausente).
- `ad0e2b5` `feat(flags): gate voice tab and quarantine route behind the voice switch` (4 archivos src).
- `funcionesSQL/` está giignoreado (los espejos no se versionan) y los scripts de migración tampoco: `temp_sql/modo_intermedio_upr.sql` queda sin trackear (convención del repo).
- Branch: `feat/intermedio-gate-front` (desde `0aa1eaa`, base `feat/modo-intermedio-voz` del otro agente).
- Supabase: migración aplicada y verificada en vivo (SELECT de `app_feature_flags` post-migración).