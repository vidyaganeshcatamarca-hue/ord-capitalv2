# fn_admin_retencion

**Espejo creado:** 2026-10-02 · **Estado:** desplegada y verificada (200 JWT real / 401 anon)
**SQL fuente:** ord-admin/admin/sql/fase_d_fn_admin_retencion.sql

## Que hace
Pantalla Retencion (PRD §19.6). Matriz de cohortes por mes de alta x D7/D30/D60/D90. D-N = reingreso entre dia N y N+6 desde el alta (misma definicion de resumen_global). Dos metricas por nivel: acceso (p_app_sessions) y uso_real (p_caja expense/income/transfer). Solo cuenta como ELEGIBLEs los usuarios cuya ventana N..N+6 ya transcurrio (no castiga cohortes jovenes). Gate fn_admin_session, SECURITY DEFINER, REVOKE anon, auditoria. p_plan reservado; version/platform no aplican a cohortes de alta (nota).

## Verificacion (02/10)
deploy 201 · JWT 200 con matriz y notas · anon 401 ✔