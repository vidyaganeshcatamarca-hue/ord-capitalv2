# fn_admin_config_guardar / fn_admin_config_listar

**Espejo creado:** 2026-10-02 · **Estado:** desplegadas y verificadas E2E
**SQL fuente:** ord-admin/admin/sql/adm_a2_escritura_config.sql

## Que hacen
Primera familia MUTANTE del panel Admin. listar: gate fn_admin_session + devuelve las 20 claves de app_global_config con descripcion, el bloque version_policy (row de p_app_version_policy id=1) y meta.escritura_habilitada. guardar(clave,valor): gate session, ROL admin estricto (viewer rebota error_admin_only), kill-switch (admin_escritura_habilitado=false -> error_admin_write_disabled), solo claves existentes (error_clave_inexistente), validacion por familia (cps_* numerico, modo_avanzado_* boolean -> error_valor_invalido), noop si el valor no cambia (cambio:false, sin write ni auditoria), y deja en admin_audit_log {clave, anterior, nuevo}. Sin STABLE (fn_admin_session escribe: STABLE revienta 405 via PostgREST).

## Verificacion (02/10)
listar 200 (claves=20, policy legible) · anon 401 · zombie/valor invalido/noop correctos · kill OFF -> error_admin_write_disabled · re-enable por SQL (unico camino, diseniado) ✔