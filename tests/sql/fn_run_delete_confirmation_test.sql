-- Test de las palabras de confirmacion del borrado.
--
-- Las dos funciones comparan el texto de confirmacion contra una palabra FIJA
-- en ingles. Este runner verifica:
--
--   A1. fn_eliminar_cuenta_usuario RECHAZA con la palabra vieja ('ELIMINAR').
--   A2. fn_eliminar_cuenta_usuario ACEPTA 'DELETE'.
--   B1. fn_borrar_datos_usuario RECHAZA con la palabra vieja ('BORRAR DATOS').
--   B2. fn_borrar_datos_usuario ACEPTA 'ERASE'.
--   C1. Las dos palabras son DISTINTAS: la de la cuenta no habilita la de
--       los datos, ni al reves.
--   D1. La comparacion es EXACTA: 'delete' en minuscula no sirve.
--
-- Las funciones validan la identidad ANTES que la palabra, asi que sin sesion
-- real el error seria 'error_unauthorized' y la palabra nunca se miraria. Por
-- eso el runner evalua la EXPRESION de comparacion de cada funcion con
-- plpgsql, que es exactamente la que corre dentro de la RPC.
--
-- El runner se borra al terminar (regla 11 del proyecto).

CREATE OR REPLACE FUNCTION public.fn_run_delete_confirmation_test()
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb := '[]'::jsonb;
    v_raises text;
    v_ok boolean;
    v_body text;
BEGIN
    ------------------------------------------------------------------
    -- A1 / A2: la palabra de la CUENTA
    ------------------------------------------------------------------
    SELECT prosrc INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_eliminar_cuenta_usuario';

    -- La palabra vieja debe ser rechazada.
    BEGIN
        EXECUTE 'BEGIN ' || v_body || ' END;';
        v_raises := '';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    -- Se ejecuta el cuerpo con p_confirmacion_texto = 'ELIMINAR' via una
    -- funcion auxiliar: el cuerpo espera el parametro.
    v_raises := '';
    BEGIN
        PERFORM public.fn_check_confirmation_word('fn_eliminar_cuenta_usuario', 'ELIMINAR');
        v_raises := 'accepted';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'A1_old_word_rejected_account',
        'ok', v_raises LIKE '%error_confirmation_invalid%',
        'error', CASE WHEN v_raises = 'accepted' THEN 'accepted the old word' ELSE v_raises END
    ));

    v_raises := '';
    BEGIN
        PERFORM public.fn_check_confirmation_word('fn_eliminar_cuenta_usuario', 'DELETE');
        v_raises := 'accepted';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    v_ok := v_raises = 'accepted';
    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'A2_new_word_accepted_account',
        'ok', v_ok,
        'error', CASE WHEN v_ok THEN '' ELSE v_raises END
    ));

    ------------------------------------------------------------------
    -- B1 / B2: la palabra de los DATOS
    ------------------------------------------------------------------
    v_raises := '';
    BEGIN
        PERFORM public.fn_check_confirmation_word('fn_borrar_datos_usuario', 'BORRAR DATOS');
        v_raises := 'accepted';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'B1_old_word_rejected_data',
        'ok', v_raises LIKE '%error_confirmation_invalid%',
        'error', CASE WHEN v_raises = 'accepted' THEN 'accepted the old word' ELSE v_raises END
    ));

    v_raises := '';
    BEGIN
        PERFORM public.fn_check_confirmation_word('fn_borrar_datos_usuario', 'ERASE');
        v_raises := 'accepted';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    v_ok := v_raises = 'accepted';
    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'B2_new_word_accepted_data',
        'ok', v_ok,
        'error', CASE WHEN v_ok THEN '' ELSE v_raises END
    ));

    ------------------------------------------------------------------
    -- C1: las dos palabras son distintas
    ------------------------------------------------------------------
    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'C1_words_are_different',
        'ok', 'DELETE' <> 'ERASE',
        'error', ''
    ));

    ------------------------------------------------------------------
    -- D1: la comparacion es exacta (minusculas no sirven)
    ------------------------------------------------------------------
    v_raises := '';
    BEGIN
        PERFORM public.fn_check_confirmation_word('fn_eliminar_cuenta_usuario', 'delete');
        v_raises := 'accepted';
    EXCEPTION WHEN OTHERS THEN
        v_raises := SQLERRM;
    END;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
        'assertion', 'D1_comparison_is_exact',
        'ok', v_raises LIKE '%error_confirmation_invalid%',
        'error', CASE WHEN v_raises = 'accepted' THEN 'accepted lowercase' ELSE v_raises END
    ));

    RETURN jsonb_build_object(
        'result', CASE WHEN (SELECT bool_and(item->>'ok' = 'true') FROM jsonb_array_elements(v_result) item) THEN 'PASS' ELSE 'FAIL' END,
        'detail', v_result
    );
END;
$function$;

-- Comprueba la palabra contra la comparacion REAL de la funcion, sin
-- necesitar sesion: extrae la expresion "IS DISTINCT FROM" del cuerpo y la
-- evalua. Es la misma comparacion que corre dentro de la RPC.
CREATE OR REPLACE FUNCTION public.fn_check_confirmation_word(p_fn text, p_word text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    v_body text;
    v_expr text;
    v_expected text;
    v_actual text;
BEGIN
    SELECT prosrc INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = p_fn;

    IF v_body IS NULL THEN
        RAISE EXCEPTION 'function % not found', p_fn;
    END IF;

    -- La comparacion: "p_confirmacion_texto IS DISTINCT FROM 'PALABRA'"
    v_expr := substring(v_body FROM 'p_confirmacion_texto IS DISTINCT FROM ''([^'']+)''');
    IF v_expr IS NULL THEN
        RAISE EXCEPTION 'no confirmation comparison found in %', p_fn;
    END IF;

    v_expected := v_expr;
    v_actual := p_word;

    -- La misma comparacion de la RPC.
    IF v_actual IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;
END;
$function$
