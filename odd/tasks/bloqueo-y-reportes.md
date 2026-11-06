# Feature: Bloqueo de voz/OCR por usuario + Reportes de errores (fases previas al lanzamiento)

Owner sign-offs captured in chat 2026-09-30: bloqueo = tabla dedicada sin admin UI (gestion manual por el dueño en el dashboard); reportes = v1 solo texto, fases 1.1 (capturas) y 1.2 (audio->texto) diferidas.

## Parte A — Anti-abuso: bloqueo de features por usuario

- A1. Script SQL `temp_sql/app_usuario_bloqueos.sql`: CREATE TABLE +
  RLS denied-to-users + CHECK feature_key in ('menu_carga_voz','menu_ocr') +
  (owner manages rows in dashboard). [PENDING owner OK]
- A2. Modificar `fn_obtener_modo_app()`: filtro `NOT EXISTS` de fila activa
  (activo=true y (hasta is null o hasta > now())) — prioridad bloqueo >
  preferencia > modo. [PENDING owner OK]
- A3. Update mirror `funcionesSQL/fn_obtener_modo_app.md`. (No new RPC =>
  no indice update; same file extended.)
- A4. Verificacion post-aplicado: usuario de prueba bloqueado => features[]
  sin voz; desbloqueo => vuelve. Front: SIN cambios (hasFeature ya gatea).
- A5. Commit `feat(launch): per-user feature blocking ...` (feature branch).

Decisiones: sin panel admin v1 (deuda ORD Admin PRD). Telemetria sugerida
futura (contador de uso que sugiera candidatos), nunca auto-bloqueo.

## Parte B - Reportes de errores (v1 solo texto) - SPEC DECIDIDO con el dueño (12 preguntas, 2026-09-30)

Respuestas del dueño (todas confirmadas):
1. FLUJO: formulario UNICO en una pantalla (no wizard) -> ReportarProblemaPage /reportar-problema.
2. CAMPOS: titulo (5-150) + descripcion guiada con placeholders (que paso / que esperabas /
   como lo reproduzco) (10-4000). Ambos obligatorios.
3. LIMITES: min titulo 5 chars, min descripcion 10 chars, MAX 5 reportes/usuario/dia
   (constante en la RPC; error i18n reporte_limite_diario).
4. CONTEXTO: pantalla (route) + version_app + plataforma => AUTO-CAPTURADOS INVISIBLES
   (el usuario no los ve ni los edita).
5. MIS REPORTES: EN v1 (Ajustes -> 'Mis reportes').
6. LISTA: card compacta que se EXPANDE al tocar (titulo + fecha + pill estado; expandida =>
   descripcion completa + respuesta_admin destacada 'reporte_respuesta_admin'); vacio =>
   reportes_vacio.
7. PRIVACIDAD: aviso SIEMPRE visible bajo el textarea ('no incluyas contrasenas ni datos de
   cuentas') => key reporte_aviso_privacidad. SIN checkbox, SIN filtro automatico.
8. POST-ENVIO: pantalla de exito con NUMERO de reporte (reporte_enviado_ok) + boton volver
   a Ajustes (Mis reportes queda accesible por el menu).
9. PROPIOS REPORTES: BORRAR solo si estado='nuevo' (RPC adicional fn_eliminar_mi_reporte(
   p_reporte_id) -> borra solo si owner y estado='nuevo'). No hay edicion.
10. ACCESO: item en Ajustes -> 'Reportar un problema' (y 'Mis reportes' debajo).
11. ESTADOS USUARIO: 'nuevo' gris, 'en_revision' ambar, 'resuelto' mint. 'descartado' OCULTO:
    fn_obtener_mis_reportes EXCLUYE estado='descartado'. (Owner cambia estados/respuestas a
    mano en dashboard, consistente con su decision de bloqueo manual.)
12. TELEMETRIA: 2 eventos LOW -> reporte_enviado (submit ok) y mis_reportes_open (abrir lista).

Contrato RPC (3 funciones nuevas):
- fn_crear_reporte(p_titulo text, p_descripcion text, p_pantalla text default null,
  p_version_app text default null, p_plataforma text default null) -> {reporte_id, estado}
  auth usuarios.auth_id=auth.uid(); trim; validaciones; rate limit; SECURITY DEFINER.
- fn_obtener_mis_reportes() -> [{reporte_id, titulo, estado, creado_el, respuesta_admin}]
  ultimos 50 desc, EXCLUYE estado='descartado'.
- fn_eliminar_mi_reporte(p_reporte_id) -> ok/error; DELETE propio solo estado='nuevo'.

Tabla app_reportes: reporte_id bigint identity, usuario_id bigint not null, titulo varchar(150)
not null, descripcion text not null, pantalla text null, version_app text null, plataforma text
null, estado text not null default 'nuevo' CHECK IN ('nuevo','en_revision','resuelto',
'descartado'), respuesta_admin text null, creado_el timestamptz not null default now().
RLS denied (solo RPC definer). Index (usuario_id, creado_el).

i18n (bloque reportes_*): ajustes_reportar_problema, ajustes_mis_reportes, reporte_titulo_label,
reporte_titulo_placeholder, reporte_descripcion_label, reporte_descripcion_placeholder,
reporte_aviso_privacidad, reporte_enviar, reporte_enviado_ok, reporte_error_titulo,
reporte_error_descripcion, reporte_limite_diario, reporte_error_generico, reportes_vacio,
reporte_estado_nuevo, reporte_estado_en_revision, reporte_estado_resuelto,
reporte_respuesta_admin, reporte_eliminar (+ confirm borrar), reporte_borrado_ok.

Fases diferidas: v1.1 capturas (bucket storage; NO es RPC, pide OK + policies), v1.2
audio->texto (recorder existente; solo texto a la base, audio nunca persiste).


## Parte B++ - AUDIO + CAPTURAS EN V1 (9 decisiones del dueño, 2026-09-30 sesion pulido)

El owner pidio sumar al formulario: audio explicativo + capturas. Todas dentro de V1 (decision 7: un solo release).

Audio (decisiones):
- A1: El usuario NUNCA ve la transcripcion. El texto convertido va a la base (transcripcion_audio).
     Razon del dueño: evitar que la voice API se use como servicio de STT gratis.
- A2: TEXTO O AUDIO: titulo siempre obligatorio; cuerpo = descripcion escrita (10-4000) O audio
     (uno de los dos alcanza). fn_crear_reporte valida descripcion XOR audio.
- A3: El audio crudo se ELIMINA del bucket cuando queda transcripto (solo texto persistente).
- A4: La transcripcion la administra el BACKEND (voice API) igual que carga por voz: automatica,
     el app solo deja el audio pendiente. Espejo en repo: columna + estado; logica en su API.
- A5: Duracion maxima 60s (corte local, como la carga por voz).
- A6: SIN player: solo ENVIAR o CANCELAR (misma UX que el recorder de carga).

Capturas (decisiones):
- C1: GALERIA hasta 3 imagenes (elección del dueño; la auto-captura de pantalla y la captura de
     sistema del app quedaron como explicado no viables/diferidos).
- C2: Se suben a STORAGE DE SUPABASE en segundo plano; la base guarda SOLO el link/path.
     Compresion local WebP ~1080px (implementacion, owner acuerdo implícito).

Schema app_reportes EXTENDIDO:
- transcripcion_audio text null (texto convertido backend; invisible al usuario)
- audio_estado text not null default 'sin_audio' CHECK IN ('sin_audio','pendiente','transcripto','error')
- media jsonb not null default '[]'  -- array de paths de capturas (bucket privado)
- (creado_el, estado, etc. como spec B previo)

Storage: bucket privado "reportes" (owner lo crea o script SQL storage.buckets + policies:
insert/select/delete solo para el propio usuario subprefijo uid/ y service-role para backend).
Audios en reportes/<uid>/<reporte_id>/audio.m4a? (formato del codec existente).

Defaults menores (anunciados al dueño, corregibles):
- Thumb de capturas con X para quitar antes de enviar (borra del storage).
- Si el usuario abandona el form sin enviar, el front limpia los uploads huerfanos.
- Mis reportes: iconitos sutiles para "tiene audio" / "tiene capturas".
- RPC de subida de media: NO hay; uploads directos al bucket por policy (storage no es tabla);
  fn_crear_reporte recibe media paths [] ya subidos y audio path si aplica.

Dependencia externa (dueño): voice API agrega modo job transcripcion-reporte (texto -> DB via
service role + delete audio). No toca este repo.


## Correccion de flujo audio (verificado en codigo 2026-09-30)
El audio de hoy viaja MULTIPARTE directo a la voice API (NOT storage): POST
{VOICE_API_BASE_URL}/v1/voice/jobs con audioBlob + JWT (src/voice/apiClient.ts
createVoiceJob). El modo reporte respeta ese patron: (i) fn_crear_reporte crea
la fila con audio_estado='pendiente' y devuelve reporte_id; (ii) el app sube
el audio multipart a la voice API con metadata reporte_id; (iii) backend
transcribe, escribe transcripcion_audio+audio_estado='transcripto' via
service-role, y descarta el audio. Riesgo registrado: reporte pendiente que no
llega a la API (app cerrado) -> cleanup opcional >24h con audio_estado='error'.
=> El bucket 'reportes' es de IMAGENES solamente; los audios NUNCA pasan por
storage de Supabase.
Handoff backend: docs/bug_report.md (checklist + 3 preguntas abiertas para el
backend dev).

## Correccion 2 (owner, 2026-10-01) - transcript vuelve al app pero OCULTO
El transcript SI vuelve por HTTP en el result del job (como el movimiento
parseado de carga voz); el front lo mantiene oculto (nunca se renderiza) y lo
envia en la MISMA RPC fn_crear_reporte junto con todo el material (titulo,
descripcion? null, transcripcion_audio, media paths, contexto):
- La voice API NO escribe nada en Supabase (sin service-role, sin BD).
- El audio crudo NO se persiste en NINGUN lado (front lo descarta al enviar;
  API igual que hoy descarga y descarta).
- Columna audio_estado ELIMINADA del schema; reemplazada por simple
  `tiene_audio boolean default false` (para icono en Mis reportes).
- Transcripcion fallida => NO hay reporte insertado: front bloquea envio con
  i18n reporte_error_transcripcion ("reintentá o escribelo"). Insert todo-o-nada.
- Job orphan (user cerro app mid-job) => limpieza con la mecanica actual de jobs
  abandonados del backend (>24h). Nada queda colgado en Supabase.
- Schema app_reportes final v1: reporte_id, usuario_id, titulo, descripcion null,
  transcripcion_audio text null, tiene_audio bool default false, media jsonb [],
  pantalla, version_app, plataforma, estado, respuesta_admin, creado_el.
- docs/bug_report.md rev.2 reescrita con este flujo + checklist ajustado (sin
  DB write) + 4 preguntas abiertas (shape result, endpoint/cola, cap modo,
  reintentos).

## Progreso ejecucion (orquestador, 2026-10-01)
- [x] A1 temp_sql/app_usuario_bloqueos.sql APPLICADA (tabla+RLS+index parcial+FK usuarios).
- [x] A2 fn_obtener_modo_app rev.4 con filtro NOT EXISTS APPLICADA.
- [x] B1 temp_sql/app_reportes.sql APPLICADA: tabla+RLS+indexes+RPCs+bucket 'reportes'
      (privado, 4MB, mime imagen) + policies por subprefijo uid/.
- [x] v1.1 p_tipo (bug|sugerencia): columna + RPCs actualizadas y aplicadas
      (temp_sql/app_reportes_tipo.sql). Defaults: tipo default 'bug'.
- [x] Espejos: fn_crear_reporte.md, fn_obtener_mis_reportes.md, fn_eliminar_mi_reporte.md,
      fn_obtener_modo_app.md (rev.4). Indice de funciones.md: 3 entradas nuevas (234-236)
      + nota rev.4 en la 210.
- [~] Front work-unit 1 (texto+capturas+MisReportes) delegado a bug-fixer: COMPLETADO
      (8 archivos: es.ts 35 keys, ReportarProblemaPage/.css, MisReportesPage/.css,
      App.tsx rutas /reportar-problema + /mis-reportes, ConfiguracionPage rows, CSS hub).
      Desviaciones del sub-agente: filas de Ajustes en ConfiguracionPage.tsx (hub fuera
      de surfaces); usa ConfirmModal existente; thumbs via createSignedUrl(s).
- [x] Front work-unit 1.1 (selector tipo) COMPLETADO.
- [x] Contrato backend CERRADO (docs/bug_report.md rev.3 sec.9, 2026-10-02): misma cola
      kind='bug_report', result {kind, transcript es-AR SIEMPRE}, caps 60s/10MiB/5h-24h-7d,
      retry_wait=backend reintentando 30/120/600 (front nunca re-subé), terminal_failed
      error_code estable, audio descartado, transcript 24h retention, sin cancel backend.
- [x] Front work-unit 2 (AUDIO) COMPLETADO via bug-fixer + commit 92eca37: contract.ts
      BUG_REPORT_MAX_AUDIO_MS=60000 + context-optional/kind/audio_codec (movements
      byte-identical); apiClient.createBugReportJob + getBugReportTranscript (reader
      hermano: getVoiceJob type-guard descarta results no-movement); useVoiceRecorder
      maxDurationMs parametrizado (default 30s intacto); form: modo Escribir/Nota de voz
      (xor), grabar con corte 60s, solo enviar/cancelar (sin player), transcript oculto
      -> p_transcripcion_audio + p_tiene_audio, all-or-nothing, mapping errores
      reporte_audio_* (13 keys nuevas). tsc PASS, i18n sin regresion (249 preexist + 4 1b).
- [x] Gates + commits: 4 commits (08b5f6e, f7da083, 92eca37, 090b755) en feat/intermedio-gate-front.
- [x] Test transaccional COMPLETADO (con OK del dueno): tests/sql/fn_run_reporte_test.sql
      + run_reporte_test.js (BEGIN/CREATE/SELECT/DROP/ROLLBACK en un solo query).
      PASS 11/11: crear ok, titulo corto, titulo 151, desc 9, sin cuerpo, tipo invalido,
      mis_reportes (solo 2 propios no-descartado, sin transcripcion_audio, con tipo),
      B no borra de A, A borra su 'nuevo', limite 5/24h. Tabla limpia verificada (0 rows,
      runner 0). tests/sql es git ignore por convencion (sin commit).
- [x] Mejora del test: fn_crear_reporte ahora valida titulo > 150 ANTES del insert
      (error_reporte_titulo pulido en vez de excepcion cruda de varchar). Espejo
      actualizado (rev 2026-10-02).
- [ ] Pendiente: audio (button del form + client apiClient call modo 'reporte') espera
      respuesta backend (docs/bug_report.md rev.2, 4 preguntas abiertas).

## Adenda traduccion texto (2026-10-02) COMPLETADA
- [x] docs/bug_report.md sec.10 (adenda backend aprobada por orquestador).
- [x] Front work-unit 3 via gentle-ai-worker + commit 090b755: contract.ts
      BUG_REPORT_TRANSLATE_PATH; apiClient.translateBugReportText (JSON POST,
      {error:{code}} estable con fallback 'BUG_REPORT_TRANSLATION_FAILED', abort
      passthrough, network -> createNetworkError); pagina: modo texto ahora
      SIEMPRE pasa por translate antes de fn_crear_reporte (all-or-nothing
      verificado en handleSubmit: errorCode/abort/session-missing returns early),
      RATE_LIMITED -> reporte_translate_limite, resto -> reporte_translate_error
      (2 keys nuevas). Audio y RPC intactos. tsc PASS; i18n sin regresion.
- Nota: getVoiceJob guard de tipos descarta results no-movement (por eso el
      reader hermano getBugReportTranscript de 92eca37).

