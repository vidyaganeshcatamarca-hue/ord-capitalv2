CREATE INDEX idx_p_app_sessions_open
    ON public.p_app_sessions (user_id)
    WHERE status IN ('active', 'paused');
