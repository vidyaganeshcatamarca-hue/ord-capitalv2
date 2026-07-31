ALTER TABLE public.usuarios
    ADD COLUMN total_usage_seconds INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_session_at TIMESTAMPTZ;
