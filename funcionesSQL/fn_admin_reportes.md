# fn_admin_reportes

**Espejo creado:** 2026-10-02 · **Estado:** desplegada y verificada (200 JWT real / 401 anon)
**SQL fuente:** ord-admin/admin/sql/fase_d_fn_admin_reportes.sql

## Que hace
Pantalla Reportes (PRD complementario nuevas.md). Fuente de verdad app_reportes (gana la tabla sobre eventos, §4.2): total por modo derivado (audio/text/both desde tiene_audio+descripcion), backlog por estado, serie diaria, top-10 pantallas, idiomas, open-rate Mis reportes <=7d post envio (eventos), coherencia filas-vs-eventos. PRIVACIDAD absoluta: jamas lee titulo/descripcion/transcripcion_audio/media/respuesta_admin (§3 del PRD). Notas: send_mode del evento todavia no desplegado en la app; latencia de resolucion no medible (app_reportes no tiene updated_at).

## Verificacion (02/10)
deploy 201 · JWT 200 con modos/backlog/pantallas · anon 401 ✔