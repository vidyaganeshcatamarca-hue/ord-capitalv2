# fn_admin_errores

**Espejo creado:** 2026-10-02 · **Estado:** desplegada y verificada (200 JWT real / 401 anon)
**SQL fuente:** ord-admin/admin/sql/fase_d_fn_admin_errores.sql

## Que hace
Pantalla Errores (PRD §19.8 + PRD complementario nuevas.md §7 voz). app_error: top por error_code con usuarios y ultimo (VERIFICADO: las properties solo tienen error_code+attempt → pantalla/operacion del PRD NO instrumentadas, nota honesta). BLOQUE VOZ: embudo completo de eventos voice_* vivos, tasa_fallo_admision_pct (sent vs send_failed; al 02/10 = 34.2%!), codigos de falla de admision/procesamiento. Incluye voice_quarantine_approved (evento extra vivo no documentado en el PRD).

## Verificacion (02/10)
deploy 201 · JWT 200 con embudo voz (218/133/111/99...) · anon 401 ✔