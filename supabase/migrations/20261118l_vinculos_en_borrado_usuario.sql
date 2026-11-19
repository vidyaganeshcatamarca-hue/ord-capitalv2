-- The Vinculos answers table was created after the deletion array was patched, so
-- it was the only loan table still missing from it.
--
-- Everything else the routine still trips over is OUTSIDE this module: 45 tables
-- reference usuarios and the array lists 22. Deciding which of the remaining 23
-- (legal consents, telemetry, notification logs, secrets) must be erased versus
-- retained is a product and legal decision, not a technical one, so this migration
-- does not touch them.

BEGIN;

DO $fix$
DECLARE
    v_oid oid;
    v_def text;
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';

    v_def := pg_get_functiondef(v_oid);

    IF position('p_prestamos_vinculos' IN v_def) > 0 THEN
        RAISE NOTICE 'ya estaba';
        RETURN;
    END IF;

    IF position($a$        'p_prestamos_pagos',$a$ IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el ancla de p_prestamos_pagos';
    END IF;

    v_def := replace(v_def,
        $a$        'p_prestamos_pagos',$a$,
        $b$        'p_prestamos_vinculos',
        'p_prestamos_pagos',$b$);

    EXECUTE v_def;
    RAISE NOTICE 'p_prestamos_vinculos agregado al borrado de usuario';
END $fix$;

COMMIT;
