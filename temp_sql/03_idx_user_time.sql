CREATE INDEX idx_p_app_sessions_user_time
    ON public.p_app_sessions (user_id, started_at DESC);
