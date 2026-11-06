CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     bigint;
  v_terminos    text := NULLIF(NEW.raw_user_meta_data->>'terminos_version', '');
  v_privacidad  text := NULLIF(NEW.raw_user_meta_data->>'privacidad_version', '');
BEGIN
  -- 1. Alta del usuario (mismo INSERT de siempre, sin columnas legales)
  INSERT INTO public.usuarios (
    auth_id,
    nombre,
    email,
    login,
    password
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'nombre', 'Usuario Sin Nombre'),
    NEW.email,
    NEW.email,
    'supabase_auth'
  )
  RETURNING user_id INTO v_user_id;

  -- 2. Evidencia legal inicial (equivalente a las columnas *_version_aceptada)
  IF v_terminos IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'terminos', 'aceptado', v_terminos);
  END IF;

  IF v_privacidad IS NOT NULL THEN
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_user_id, 'privacidad', 'aceptado', v_privacidad);
  END IF;

  RETURN NEW;
END;
$function$

-- ============================================================
-- Migración a log legal (2026-10-09): en el sign-up los eventos
-- 'aceptado' se insertan desde options.data
-- (raw_user_meta_data->>'terminos_version' / 'privacidad_version'), la
-- MISMA fuente que antes alimentaba terminos_version_aceptada /
-- privacidad_version_aceptada y que definía si el consentimiento inicial
-- quedaba registrado (antes: consentimiento_legal_at solo si
-- terminos_version venía no vacía).
-- La fila de `usuarios` deja de recibir las columnas legales (se eliminan
-- en el bloque 4 de 07_backfill_semillas.sql; ese DROP está diferido y NO
-- fue aplicado en Supabase todavía).
-- Cambio de robustez: se agrega SET search_path TO 'public' (el cuerpo ya
-- estaba totalmente calificado; SECURITY DEFINER sin search_path queda
-- expuesto a un search_path manipulado por el llamador).
-- ============================================================
