# fn_admin_potencial

**Espejo creado:** 2026-10-02 · **Estado:** desplegada y verificada (200 JWT real / 401 anon)
**SQL fuente:** ord-admin/admin/sql/fase_d_fn_admin_potencial.sql

## Que hace
Pantalla Potencial (PRD §19.7). Vigente = ultimo snapshot por usuario de p_telemetry_cps_snapshots: distribucion por categoria con pct + lista HP/VHP (user_id+email+score, identidad minima). Evolucion semanal (score promedio, hp_vhp por semana). planes=null y nota plan_hp_split_not_available (decision ④); intencion comercial no instrumentada (nota honesta). p_app_version/p_platform reservados (el snapshot no lleva version). Gate usual + auditoria.

## Verificacion (02/10)
deploy 201 · JWT 200 con vigente+evolucion · anon 401 ✔