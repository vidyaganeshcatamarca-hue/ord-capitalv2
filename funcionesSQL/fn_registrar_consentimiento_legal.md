-- fn_registrar_consentimiento_legal v2 — 2026-10-10 (owner OK):
-- Single source of truth = the DB published version. The primary consent
-- gate used to seal whatever version the FRONT believed current (legal.ts),
-- so a front stuck at 1.0 while the DB published 1.1 left brand-new users
-- recorded as accepting 1.0 -> the update gate immediately demanded the
-- 1.1 acceptance in the same first flow. Now, when the caller requests
-- acceptance for a doc, the event seals the CURRENT published version
-- (fallback to the passed value when the doc has no published versions).
-- Opening events keep the passed version (informative).

CREATE OR REPLACE FUNCTION public.fn_registrar_consentimiento_legal(p_terminos_version text, p_privacidad_version text, p_opened_terms boolean DEFAULT NULL::boolean, p_opened_privacy boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_term_actual text;
  v_priv_actual text;
BEGIN
  -- Identidad de la sesion (misma resolucion que antes)
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  -- Version VIGENTE publicada por documento (fuente de verdad unica:
  -- legal_document_version). Misma derivacion que fn_obtener_estado_legal.
  SELECT d.version INTO v_term_actual
    FROM public.legal_document_version d
   WHERE d.doc_type = 'terminos'
     AND NOT EXISTS (SELECT 1 FROM public.legal_document_version d2
                      WHERE d2.doc_type = d.doc_type
                        AND public.fn_compare_versions(d2.version, d.version) > 0)
   ORDER BY d.effective_at DESC, d.created_at DESC
   LIMIT 1;

  SELECT d.version INTO v_priv_actual
    FROM public.legal_document_version d
   WHERE d.doc_type = 'privacidad'
     AND NOT EXISTS (SELECT 1 FROM public.legal_document_version d2
                      WHERE d2.doc_type = d.doc_type
                        AND public.fn_compare_versions(d2.version, d.version) > 0)
   ORDER BY d.effective_at DESC, d.created_at DESC
   LIMIT 1;

  -- 1. Evidencia de aceptacion: Terminos (sella la vigente cuando existe)
  IF NULLIF(p_terminos_version, '') IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    SELECT v_user_id, 'terminos', 'aceptado',
           COALESCE(v_term_actual, p_terminos_version)
     WHERE NOT EXISTS (
         SELECT 1 FROM public.p_legal_consentimientos c
          WHERE c.user_id = v_user_id
            AND c.doc_type = 'terminos'
            AND c.evento = 'aceptado'
            AND c.version = COALESCE(v_term_actual, p_terminos_version));
  END IF;

  -- 2. Evidencia de aceptacion: Privacidad (sella la vigente cuando existe)
  IF NULLIF(p_privacidad_version, '') IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    SELECT v_user_id, 'privacidad', 'aceptado',
           COALESCE(v_priv_actual, p_privacidad_version)
     WHERE NOT EXISTS (
         SELECT 1 FROM public.p_legal_consentimientos c
          WHERE c.user_id = v_user_id
            AND c.doc_type = 'privacidad'
            AND c.evento = 'aceptado'
            AND c.version = COALESCE(v_priv_actual, p_privacidad_version));
  END IF;

  -- 3. Apertura del documento: Terminos (una sola fila por doc, la primera vez).
  --    Version del evento = la version vigente que el gate esta mostrando.
  IF COALESCE(p_opened_terms, false) AND NOT EXISTS (
      SELECT 1 FROM public.p_legal_consentimientos c
       WHERE c.user_id = v_user_id
         AND c.doc_type = 'terminos'
         AND c.evento = 'abierto') THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'terminos', 'abierto',
            COALESCE(v_term_actual, NULLIF(p_terminos_version, ''), '0.0'));
  END IF;

  -- 4. Apertura del documento: Privacidad
  IF COALESCE(p_opened_privacy, false) AND NOT EXISTS (
      SELECT 1 FROM public.p_legal_consentimientos c
       WHERE c.user_id = v_user_id
         AND c.doc_type = 'privacidad'
         AND c.evento = 'abierto') THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'privacidad', 'abierto',
            COALESCE(v_priv_actual, NULLIF(p_privacidad_version, ''), '0.0'));
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

## REV.2 (2026-10-10) — fuente de verdad de la version
- El gate primario sellaba la version que creia vigente el FRONT (legal.ts); con el front en 1.0 y la base en
  1.1, los usuarios nuevos quedaban como "acepto 1.0" y el gate de versionado les pedia la 1.1 en el mismo primer flujo.
- Ahora, cuando el caller pide aceptacion de un doc, el evento `aceptado` sella la version VIGENTE publicada
  en `legal_document_version` (fallback al parametro si el doc no tiene versiones). Los eventos `abierto` tambien usan la vigente.


COMMENT ON FUNCTION public.fn_registrar_consentimiento_legal(text, text, boolean, boolean) IS
    'Registra eventos legales del usuario autenticado en p_legal_consentimientos: aceptado (por version, idempotente) y abierto (una sola vez por documento). Retorna {ok:true}.';

-- ============================================================
-- Tanda 2 telemetría (2026-09-17): firma ampliada con
-- p_opened_terms / p_opened_privacy (parámetros opcionales).
-- El componente del gate legal envía true cuando el usuario hace
-- click en los links de Términos/Privacidad (ANTES de aceptar).
-- Llamadas existentes de 2 parámetros siguen siendo válidas.
--
-- Migración a log legal (2026-10-09): la función deja de escribir las
-- columnas legales de `usuarios` (consentimiento_legal_at,
-- *_version_aceptada, opened_terms/opened_privacy) y pasa a registrar
-- eventos en p_legal_consentimientos: 'aceptado' por (doc, versión) de
-- forma idempotente y 'abierto' por doc solo la primera vez. El contrato
-- de salida no cambia: {ok:true}. Traducción 1:1 del COALESCE previo.
-- ⚠️ El camino de apertura del front todavía manda las versiones, así que
-- hoy registra 'aceptado' al abrir un documento: decisión pendiente del
-- dueño (ver aviso de diseño en temp_sql/versionado-legal/06_rpc_modificadas.sql).
-- ============================================================
