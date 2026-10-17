-- Migration: 20261017000000_candidate_form_resumes.sql
-- Description: Dedicated table for Form-First Resume Builder single source of truth.
-- Preserves historical uploaded documents in public.resumes while providing an isolated,
-- versioned, structured canonical representation for candidate-entered resume data.

CREATE TABLE IF NOT EXISTS public.candidate_form_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT candidate_form_resumes_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.candidate_form_resumes OWNER TO postgres;

-- Enable Row Level Security
ALTER TABLE public.candidate_form_resumes ENABLE ROW LEVEL SECURITY;

-- Candidates can view their own structured resume
CREATE POLICY "Users can view own form resume"
    ON public.candidate_form_resumes
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Candidates can insert their own structured resume
CREATE POLICY "Users can insert own form resume"
    ON public.candidate_form_resumes
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Candidates can update their own structured resume
CREATE POLICY "Users can update own form resume"
    ON public.candidate_form_resumes
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Candidates can delete their own structured resume
CREATE POLICY "Users can delete own form resume"
    ON public.candidate_form_resumes
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Admin and service role access
GRANT ALL ON TABLE public.candidate_form_resumes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.candidate_form_resumes TO authenticated;

-- Index on user_id for high-speed candidate lookup
CREATE INDEX IF NOT EXISTS idx_candidate_form_resumes_user_id
    ON public.candidate_form_resumes (user_id);
