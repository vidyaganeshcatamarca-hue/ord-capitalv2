-- ============================================================================
-- Versionado legal · 02 · Tabla public.p_legal_consentimientos
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §3.2
--
-- PROPOSITO
--   Log append-only por usuario de los hechos legales. Sustituye a las columnas
--   de usuarios (consentimiento_legal_at, *_version_aceptada, opened_terms,
--   opened_privacy) y pasa a ser la fuente de verdad del estado legal:
--     'aceptado'    -> el usuario acepto `version` de `doc_type` (evidencia legal)
--     'notificado'  -> el usuario vio el aviso no bloqueante de `version`
--     'abierto'     -> el usuario abrio el documento (una sola vez por doc,
--                      misma semantica que el COALESCE de los flags booleanos)
--
--   `version` es la version VIGENTE en el momento del evento y es texto libre:
--   no existe FK contra legal_document_version a proposito. El backfill de
--   usuarios historicos escribe '0.0' ("version desconocida historica") y esa
--   fila no existe en el catalogo; el funnel solo usa el evento como booleano.
--
-- ACCESO
--   RLS activado SIN policies + REVOKE ALL a cliente: no hay lectura ni escritura
--   directa desde la app. Las escrituras las hacen exclusivamente RPCs SECURITY
--   DEFINER (fn_registrar_consentimiento_legal, fn_registrar_notificacion_legal,
--   fn_handle_new_user) y la lectura fn_obtener_estado_legal / las RPCs admin.
--
-- ON DELETE CASCADE: el borrado duro de cuenta (trigger tr_delete_public_usuario ->
--   fn_delete_public_usuario_from_auth -> DELETE FROM usuarios) fallaria con una FK
--   NO ACTION sobre user_id NOT NULL. Coincide con el resto de tablas por usuario
--   (p_app_sessions, p_telemetry_user_metrics, p_telemetry_cps_snapshots).
--
-- IDEMPOTENTE: CREATE TABLE / INDEX IF NOT EXISTS (re-ejecutable sin dano).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.p_legal_consentimientos (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint NOT NULL
                   REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    doc_type   text NOT NULL
                   CHECK (doc_type IN ('terminos', 'privacidad')),
    evento     text NOT NULL
                   CHECK (evento IN ('aceptado', 'notificado', 'abierto')),
    version    text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indice para derivar el estado por usuario (EXISTS por doc/evento/version).
CREATE INDEX IF NOT EXISTS idx_legal_consentimientos_user_doc
    ON public.p_legal_consentimientos (user_id, doc_type);

-- NOTA (no incluido por alcance): los conteos por version del panel Admin
-- (fn_admin_legal_versiones_listar) agrupan por (doc_type, version, evento).
-- Con el volumen actual no hace falta indice; si el log crece, agregar
--   CREATE INDEX ... ON public.p_legal_consentimientos (doc_type, evento, version);

COMMENT ON TABLE public.p_legal_consentimientos IS
    'Log append-only de eventos legales (aceptado/notificado/abierto) por usuario y documento. RLS sin policies: escritura solo via RPC SECURITY DEFINER. `version` es texto libre (0.0 = version historica desconocida del backfill).';

ALTER TABLE public.p_legal_consentimientos ENABLE ROW LEVEL SECURITY;

-- Belt and braces junto con RLS: la unica via de acceso es una RPC DEFINER.
REVOKE ALL ON TABLE public.p_legal_consentimientos FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
