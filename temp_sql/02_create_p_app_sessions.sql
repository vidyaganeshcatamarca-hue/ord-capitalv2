CREATE TABLE public.p_app_sessions (
    session_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 BIGINT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    platform                TEXT NOT NULL DEFAULT 'web',
    app_version             TEXT,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at                TIMESTAMPTZ,
    paused_at               TIMESTAMPTZ,
    total_active_seconds    INTEGER NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','paused','completed','crashed')),
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
