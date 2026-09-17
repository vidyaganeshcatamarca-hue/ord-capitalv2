-- ============================================================
-- Tanda 2: Gate legal + FK de telemetría (ORD Capital Personal)
-- Fecha: 2026-09-17
-- 1) Columnas de apertura de documentos legales en usuarios
-- 2) fn_registrar_consentimiento_legal: captura el click en los
--    links de Términos/Privacidad (flags booleanos, sin eventos
--    ni timestamps) — firma ampliada, parámetros opcionales
-- 3) FK pendiente de Tanda 1 en p_telemetry_events
-- ============================================================

-- 1. Columnas de apertura de documentos legales
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS opened_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opened_privacy boolean NOT NULL DEFAULT false;

-- 2. Extensión de la RPC de consentimiento legal
CREATE OR REPLACE FUNCTION public.fn_registrar_consentimiento_legal(
  p_terminos_version text,
  p_privacidad_version text,
  p_opened_terms boolean DEFAULT NULL,
  p_opened_privacy boolean DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  UPDATE public.usuarios SET
    consentimiento_legal_at = COALESCE(consentimiento_legal_at, now()),
    terminos_version_aceptada = p_terminos_version,
    privacidad_version_aceptada = p_privacidad_version,
    opened_terms = COALESCE(p_opened_terms, opened_terms),
    opened_privacy = COALESCE(p_opened_privacy, opened_privacy)
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 3. FK pendiente de Tanda 1 (los eventos sobreviven al borrado de la sesión)
ALTER TABLE public.p_telemetry_events
  DROP CONSTRAINT IF EXISTS fk_telemetry_session;
ALTER TABLE public.p_telemetry_events
  ADD CONSTRAINT fk_telemetry_session
  FOREIGN KEY (session_id) REFERENCES public.p_app_sessions(session_id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
