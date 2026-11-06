# fn_admin_policy_guardar

**Espejo creado:** 2026-10-02 · **Estado:** desplegada y verificada
**SQL fuente:** ord-admin/admin/sql/adm_a3_policy_guardar.sql

## Que hace
Edita la fila unica (id=1) de p_app_version_policy: latest_version, min_required_version (regex x.y[.z]) y mandatory. Mismas politicas que fn_admin_config_guardar (rol admin, kill-switch, diff anterior->nuevo en auditoria, effective_at=now al guardar). Error: error_valor_invalido{campo:version}, error_policy_inexistente. Leer la policy se hace via fn_admin_config_listar (bloque version_policy).

## Verificacion (02/10)
version invalida 400 con clave error_valor_invalido · roundtrip 1.0/1.0/false 200 · deploy tras dry-run ✔