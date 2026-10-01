-- temp_sql/app_usuario_bloqueos.sql
-- Per-user feature blocking (anti-abuse): the owner inserts/deletes rows
-- manually in the dashboard. fn_obtener_modo_app() filters features OUT when
-- an active row exists for the user (override: block > preference > mode).
-- 2026-10-01

CREATE TABLE IF NOT EXISTS public.app_usuario_bloqueos (
  bloqueo_id  bigserial PRIMARY KEY,
  usuario_id  bigint NOT NULL,
  feature_key text NOT NULL CHECK (feature_key IN ('menu_carga_voz', 'menu_ocr')),
  activo      boolean NOT NULL DEFAULT true,
  motivo      text,
  creado_el   timestamptz NOT NULL DEFAULT now(),
  hasta       timestamptz CHECK (hasta IS NULL OR hasta > now())
);

-- Reaplicable: no duplicates while active
CREATE UNIQUE INDEX IF NOT EXISTS ux_bloqueos_usuario_feature_activo
  ON public.app_usuario_bloqueos (usuario_id, feature_key)
  WHERE activo = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_bloqueos_usuario'
  ) THEN
    ALTER TABLE public.app_usuario_bloqueos
      ADD CONSTRAINT fk_bloqueos_usuario
      FOREIGN KEY (usuario_id) REFERENCES public.usuarios(user_id);
  END IF;
END $$;

ALTER TABLE public.app_usuario_bloqueos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bp_bloqueos_deny_all ON public.app_usuario_bloqueos;
CREATE POLICY bp_bloqueos_deny_all ON public.app_usuario_bloqueos
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);