-- ============================================================================
-- Versionado legal · 07 · Backfill historico + semillas v1.1 + DROP de columnas
-- Feature: odd/tasks/versionado-legal.md
-- Spec:    docs/spec-versionado-legal-2026-10-09.md §3.3, §3.4, §3.5
--
-- ORDEN DE EJECUCION (IMPORTANTE)
--   BLOQUE 1 (backfill 'aceptado') : migra la evidencia legal que hoy vive en
--                                    usuarios.*_version_aceptada al log.
--   BLOQUE 2 (backfill 'abierto')  : migra opened_terms / opened_privacy al log.
--   BLOQUE 3 (semillas v1.1)       : publica la fila 1.1 de terminos y privacidad.
--   BLOQUE 4 (DROP de columnas)    : ETAPA POSTERIOR. NO es parte del mismo
--                                    release que los bloques 1-3.
--
--   Los bloques 1-3 son idempotentes y van sin BEGIN/COMMIT propio (una sentencia
--   cada uno, transaccion implicita). El bloque 4 va aparte, en su propio bloque
--   transaccional, para poder aplicarlo recien cuando la logica basada en el log
--   este verificada en produccion. Si alguien ejecuta este archivo COMPLETO como
--   una sola sentencia, el COMMIT del bloque 4 cierra la transaccion implicita y
--   los drops se aplican: por eso el bloque 4 esta marcado y comentado abajo.
--
--   Los bloques 1-3 REQUIEREN que 01, 02, 03, 04, 05 y 06 ya esten aplicados.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 · Backfill de eventos 'aceptado' desde las columnas de usuarios
--   Idempotente: solo inserta si no existe ya el evento para esa version.
--   Es el paso que evita que los usuarios existentes tengan que re-aceptar por
--   la v1.1 (decision 7 del spec): su aceptacion historica queda registrada con
--   la version que la columna ya guardaba.
-- ============================================================================

-- 1.a Terminos
INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
SELECT u.user_id, 'terminos', 'aceptado', u.terminos_version_aceptada
  FROM public.usuarios u
 WHERE u.terminos_version_aceptada IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.p_legal_consentimientos c
        WHERE c.user_id = u.user_id
          AND c.doc_type = 'terminos'
          AND c.evento = 'aceptado'
          AND c.version = u.terminos_version_aceptada);

-- 1.b Privacidad
INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
SELECT u.user_id, 'privacidad', 'aceptado', u.privacidad_version_aceptada
  FROM public.usuarios u
 WHERE u.privacidad_version_aceptada IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.p_legal_consentimientos c
        WHERE c.user_id = u.user_id
          AND c.doc_type = 'privacidad'
          AND c.evento = 'aceptado'
          AND c.version = u.privacidad_version_aceptada);


-- ============================================================================
-- BLOQUE 2 · Backfill de eventos 'abierto' desde opened_terms / opened_privacy
--   Version del evento = la version aceptada por el usuario; '0.0' si no hay
--   ("version desconocida historica": no existe en legal_document_version, el
--   funnel solo usa el evento como booleano, §3.4).
--   Idempotente: 'abierto' se inserta solo si no existe previo para (user, doc).
-- ============================================================================

-- 2.a Terminos
INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
SELECT u.user_id, 'terminos', 'abierto', COALESCE(u.terminos_version_aceptada, '0.0')
  FROM public.usuarios u
 WHERE u.opened_terms
   AND NOT EXISTS (
       SELECT 1 FROM public.p_legal_consentimientos c
        WHERE c.user_id = u.user_id
          AND c.doc_type = 'terminos'
          AND c.evento = 'abierto');

-- 2.b Privacidad
INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
SELECT u.user_id, 'privacidad', 'abierto', COALESCE(u.privacidad_version_aceptada, '0.0')
  FROM public.usuarios u
 WHERE u.opened_privacy
   AND NOT EXISTS (
       SELECT 1 FROM public.p_legal_consentimientos c
        WHERE c.user_id = u.user_id
          AND c.doc_type = 'privacidad'
          AND c.evento = 'abierto');


-- ============================================================================
-- BLOQUE 3 · Semillas de rollout v1.1 (§3.5)
--   requires_acceptance = false + requires_notification = true
--   => los usuarios existentes (con backfill) reciben 'notify' y ven el modal
--      combinado una sola vez; los sign-ups nuevos aceptan 1.1 en el gate.
--   Idempotente: ON CONFLICT DO NOTHING (re-ejecutar no cambia flags publicados).
--   REGLA DE RELEASE (§6): el HTML de 1.1 tiene que estar deployado ANTES de
--   publicar esta fila. Nunca publicar la fila con el HTML sin deployar.
-- ============================================================================
INSERT INTO public.legal_document_version (
    doc_type, version, requires_acceptance, requires_notification
) VALUES
    ('terminos',   '1.1', false, true),
    ('privacidad', '1.1', false, true)
ON CONFLICT (doc_type, version) DO NOTHING;


NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- BLOQUE 4 · DROP de las columnas legales de usuarios   ⚠️ ETAPA POSTERIOR ⚠️
-- ----------------------------------------------------------------------------
-- AVISO: NO ejecutar este bloque en el mismo paso que los bloques 1-3.
--   Se deja al final y en su propio bloque transaccional para poder aplicarlo
--   como release posterior, cuando la logica basada en el log este verificada:
--     - fn_obtener_estado_legal + overlay/modal en produccion sin incidentes
--     - fn_verificar_status_onboarding / fn_handle_new_user / funnel ya
--       leyendo del log (06 aplicado)
--     - backfill (bloques 1-2) aplicado y chequeado
--
--   REVISAR ANTES DE APLICAR (dependencias externas a este archivo):
--     1) ord-admin/admin/sql/fase_b_fn_admin_ficha_usuario.sql todavia lee
--        usuarios.consentimiento_legal_at (timeline 'aceptacion_legal' y el
--        SELECT INTO de la ficha). Sin actualizar esa RPC, el DROP la rompe.
--        => decision del dueno: actualizar la ficha al log o postergar el DROP.
--     2) tests/sql/consentimiento_tyc_test.sql y tests/sql/migration_consentimiento_tyc.sql
--        operan sobre estas columnas (runners historicos): quedan obsoletos.
--     3) src/: sin referencias directas a estas columnas (chequeado); el front
--        solo usa las RPCs fn_registrar_consentimiento_legal /
--        fn_verificar_status_onboarding.
--
--   Chequeo previo sugerido (ejecutar aparte; debe devolver 0 filas antes del DROP):
--     SELECT u.user_id
--       FROM public.usuarios u
--      WHERE u.consentimiento_legal_at IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM public.p_legal_consentimientos c
--                         WHERE c.user_id = u.user_id AND c.evento = 'aceptado');
-- ============================================================================

BEGIN;

ALTER TABLE public.usuarios
    DROP COLUMN IF EXISTS consentimiento_legal_at,
    DROP COLUMN IF EXISTS terminos_version_aceptada,
    DROP COLUMN IF EXISTS privacidad_version_aceptada,
    DROP COLUMN IF EXISTS opened_terms,
    DROP COLUMN IF EXISTS opened_privacy;

COMMIT;

NOTIFY pgrst, 'reload schema';
