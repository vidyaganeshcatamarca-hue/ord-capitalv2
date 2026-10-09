-- ============================================================================
-- Versionado legal · 01 · Tabla public.legal_document_version
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §3.1
--
-- PROPOSITO
--   Catalogo global y append-only de las versiones publicadas de los documentos
--   legales (Terminos y Politica de Privacidad) + el "nivel de politica" de esa
--   version (§2 del spec), que es lo que decide la UX:
--     requires_acceptance   = true  -> overlay bloqueante hasta re-aceptar
--     requires_notification = true  -> modal combinado no bloqueante (1 vez/version)
--     ambos false                   -> 'none', sin accion para el usuario
--   Los flags se deciden en el momento de publicar y son INMUTABLES por version
--   (una version publicada solo se acepta o se re-publica identica).
--
-- PATRON HERMANO
--   p_app_version_policy + fn_check_app_version (tests/sql/migration_consentimiento_v2.sql):
--   tabla de politica leida por una RPC SECURITY DEFINER, sin acceso de cliente.
--
-- ACCESO
--   RLS activado SIN policies y REVOKE ALL a cliente: la unica via de lectura es
--   una RPC SECURITY DEFINER (fn_obtener_estado_legal para la app;
--   fn_admin_legal_versiones_listar para el panel ORD Admin).
--   La unica via de escritura es fn_admin_legal_version_publicar (panel Admin).
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS (re-ejecutable sin dano).
-- NO crea datos: las semillas de rollout viven en 07_backfill_semillas.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legal_document_version (
    doc_type              text NOT NULL
                              CHECK (doc_type IN ('terminos', 'privacidad')),
    version               text NOT NULL,
    requires_acceptance   boolean NOT NULL DEFAULT false,
    requires_notification boolean NOT NULL DEFAULT false,
    effective_at          timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT legal_document_version_pkey PRIMARY KEY (doc_type, version)
);

-- NOTA: el formato de `version` (x.y[.z]) NO se valida por CHECK en la tabla
-- porque el unico escritor es fn_admin_legal_version_publicar, que lo valida con
-- el mismo regex que fn_admin_policy_guardar. Evita ademas romper
-- fn_compare_versions (que castea los segmentos a int).

COMMENT ON TABLE public.legal_document_version IS
    'Catalogo de versiones legales publicadas (terminos/privacidad) con sus flags de politica (requires_acceptance/requires_notification) y effective_at. Append-only, RLS sin policies: se lee via RPC SECURITY DEFINER y se escribe solo via fn_admin_legal_version_publicar.';

COMMENT ON COLUMN public.legal_document_version.requires_acceptance IS
    'Nivel require_acceptance: overlay bloqueante hasta que exista evento aceptado de esta version.';
COMMENT ON COLUMN public.legal_document_version.requires_notification IS
    'Nivel notify: aviso no bloqueante una vez por version (evento notificado).';
COMMENT ON COLUMN public.legal_document_version.effective_at IS
    'Fecha de vigencia declarada al publicar. En esta release es informativa/auditoria: la version vigente se resuelve por mayor `version` (ver fn_obtener_estado_legal).';

-- RLS activado sin policies: ningun cliente puede SELECT/INSERT directo.
ALTER TABLE public.legal_document_version ENABLE ROW LEVEL SECURITY;

-- Belt and braces junto con RLS: la unica via de acceso es una RPC DEFINER.
REVOKE ALL ON TABLE public.legal_document_version FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
