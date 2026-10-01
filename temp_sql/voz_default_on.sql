-- Owner decision 2026-09-30 (v2): voice switch default back to ON
-- (v1 left it OFF; reverse of temp_sql/modo_intermedio_upr.sql step 1).
-- The intermediate-tier gate logic stays unchanged: the switch remains the key.
BEGIN;

ALTER TABLE public.p_preferencias_usuario
  ALTER COLUMN voz_activada SET DEFAULT true;
UPDATE public.p_preferencias_usuario SET voz_activada = true;

COMMIT;