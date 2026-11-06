CREATE OR REPLACE FUNCTION public.fn_check_app_version(p_app_version TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_min text;
  v_latest text;
  v_mandatory boolean;
  v_store_url constant text := 'https://play.google.com/store/apps/details?id=com.ordcapital.personal';
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  UPDATE public.usuarios SET app_version = p_app_version WHERE user_id = v_user_id;

  SELECT min_required_version, latest_version, mandatory
    INTO v_min, v_latest, v_mandatory
  FROM public.p_app_version_policy ORDER BY effective_at DESC, id DESC LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('status', 'ok', 'current', p_app_version,
      'store_url', v_store_url, 'mandatory', false);
  END IF;

  IF v_mandatory AND public.fn_compare_versions(p_app_version, v_min) < 0 THEN
    RETURN jsonb_build_object('status', 'update_required', 'current', p_app_version,
      'min_required', v_min, 'latest', v_latest, 'store_url', v_store_url, 'mandatory', true);
  END IF;

  IF public.fn_compare_versions(p_app_version, v_latest) < 0 THEN
    RETURN jsonb_build_object('status', 'update_available', 'current', p_app_version,
      'min_required', v_min, 'latest', v_latest, 'store_url', v_store_url, 'mandatory', v_mandatory);
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'current', p_app_version,
    'min_required', v_min, 'latest', v_latest, 'store_url', v_store_url, 'mandatory', v_mandatory);
END;
$function$
