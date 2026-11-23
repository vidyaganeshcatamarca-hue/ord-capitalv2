-- Register the loans module in the feature-flag catalogue.
--
-- hasFeature(key) is `features.has(key)`, so a missing key hides the navigation
-- entry. The frontend now renders a `/prestamos` item labelled `menu_prestamos`;
-- without this row the module would only be reachable by typing the URL.
--
-- modo_minimo = 'simple': the loans section is not an advanced-only surface, unlike
-- menu_saneamiento (which is 'avanzado' and currently inactive). activo = true so it
-- is visible by default.
--
-- Idempotent: re-running leaves the existing row alone apart from reasserting
-- activo = true.

BEGIN;

INSERT INTO public.app_feature_flags (feature_key, modo_minimo, orden, descripcion, activo)
VALUES ('menu_prestamos', 'simple', 55, 'Modulo de prestamos y saneamiento', true)
ON CONFLICT (feature_key) DO UPDATE
    SET modo_minimo = EXCLUDED.modo_minimo,
        descripcion = EXCLUDED.descripcion,
        activo      = true;

COMMIT;
