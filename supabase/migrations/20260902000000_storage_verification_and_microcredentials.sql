-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Storage RLS & Microcredentials Catalog Fix
-- Migration: 20260902000000_storage_verification_and_microcredentials.sql
--
-- Scope:
--   1. Storage Objects RLS for bucket 'resumes':
--      - INSERT: Candidate can upload to <auth.uid()>/... and verifications/<auth.uid()>/...
--      - UPDATE: Candidate can upsert/update in <auth.uid()>/... and verifications/<auth.uid()>/...
--      - SELECT: Candidate can read their own <auth.uid()>/... and verifications/<auth.uid()>/...
--                Admin can read all verifications and resumes.
--                Linked employers can read candidate resumes linked to active applications.
--      - DELETE: Candidate can delete <auth.uid()>/... and verifications/<auth.uid()>/...
--      - Enforces strict folder isolation: Candidate A cannot upload, update, read, or delete
--        files in Candidate B's folder (verifications/<Candidate B>/...).
--   2. Microcredentials Catalog:
--      - Creates public.microcredentials_catalog table if not exists
--      - Indexes on canonical_skill and is_active
--      - RLS policies: Anyone can SELECT active rows; only Admins (via is_platform_admin()) can manage
--      - Grants on table
--      - Curated seed data (10 courses)
--   3. Reload PostgREST schema cache
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Storage Objects RLS Hardening for bucket 'resumes'
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    -- Drop existing resume policies
    DROP POLICY IF EXISTS "Resumes Owner Upload" ON storage.objects;
    DROP POLICY IF EXISTS "Resumes Owner & Linked Employer Select" ON storage.objects;
    DROP POLICY IF EXISTS "Resumes Owner Delete" ON storage.objects;
    DROP POLICY IF EXISTS "Resumes Owner Update" ON storage.objects;

    -- A. INSERT Policy
    -- Permits upload into user's own root folder (e.g. <uid>/resume.pdf),
    -- avatars folder, user's own verifications folder (verifications/<uid>/...),
    -- or if caller is platform admin.
    CREATE POLICY "Resumes Owner Upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR (
          (storage.foldername(name))[1] = 'verifications'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
        OR public.is_platform_admin()
      )
    );

    -- B. UPDATE Policy
    -- Required for { upsert: true } uploads and file replacements.
    -- Strict ownership: user can only update their own folder or own verification folder.
    CREATE POLICY "Resumes Owner Update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR (
          (storage.foldername(name))[1] = 'verifications'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
        OR public.is_platform_admin()
      )
    )
    WITH CHECK (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR (
          (storage.foldername(name))[1] = 'verifications'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
        OR public.is_platform_admin()
      )
    );

    -- C. SELECT Policy
    -- Permits Candidate to read their own root files and verifications files (for preview),
    -- avatars, Platform Admin review, and verified employers for linked applicants.
    CREATE POLICY "Resumes Owner & Linked Employer Select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR (
          (storage.foldername(name))[1] = 'verifications'
          AND (
            (storage.foldername(name))[2] = auth.uid()::text
            OR public.is_platform_admin()
          )
        )
        OR public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.applicant_id::text = (storage.foldername(name))[1]
            AND j.employer_id = auth.uid()
            AND public.is_employer_job_eligible(auth.uid())
        )
      )
    );

    -- D. DELETE Policy
    -- Permits Candidate to delete their own root files and verifications files.
    CREATE POLICY "Resumes Owner Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (
          (storage.foldername(name))[1] = 'verifications'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
        OR public.is_platform_admin()
      )
    );

  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Microcredentials Catalog Table & RLS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.microcredentials_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  canonical_skill TEXT NOT NULL,
  description TEXT,
  level TEXT DEFAULT 'Beginner',
  duration TEXT,
  credential_url TEXT NOT NULL,
  verification_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_microcredentials_canonical_skill
  ON public.microcredentials_catalog(canonical_skill);

CREATE INDEX IF NOT EXISTS idx_microcredentials_active
  ON public.microcredentials_catalog(is_active);

-- Enable RLS
ALTER TABLE public.microcredentials_catalog ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view active microcredentials" ON public.microcredentials_catalog;
DROP POLICY IF EXISTS "Admins can manage microcredentials" ON public.microcredentials_catalog;

-- Policy: Candidates, employers, and public users can READ active microcredentials
CREATE POLICY "Anyone can view active microcredentials"
ON public.microcredentials_catalog
FOR SELECT
TO public
USING (is_active = true);

-- Policy: Only Admins can INSERT, UPDATE, or DELETE catalog items
CREATE POLICY "Admins can manage microcredentials"
ON public.microcredentials_catalog
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- Grants
GRANT SELECT ON public.microcredentials_catalog TO anon, authenticated;
GRANT ALL ON public.microcredentials_catalog TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Seed Initial Curated Microcredentials
-- ------------------------------------------------------------------------------
INSERT INTO public.microcredentials_catalog
  (title, provider, skill_name, canonical_skill, description, level, duration, credential_url, is_active)
VALUES
  ('Docker & Container Fundamentals', 'Coursera', 'Docker', 'docker', 'Learn containerization principles, Dockerfiles, volume mounts, and container orchestration.', 'Beginner', '4 weeks', 'https://www.coursera.org/learn/docker-fundamentals', true),
  ('AWS Cloud Practitioner Essentials', 'AWS Training', 'AWS', 'aws', 'Master core AWS cloud concepts, security, IAM roles, EC2, and S3 infrastructure.', 'Beginner', '6 hours', 'https://aws.amazon.com/training/course-labs/aws-cloud-practitioner-essentials/', true),
  ('PostgreSQL Relational Database Administration', 'IBM', 'PostgreSQL', 'postgresql', 'Master SQL queries, database indexing, foreign key constraints, and performance tuning in Postgres.', 'Intermediate', '3 weeks', 'https://www.coursera.org/learn/relational-database-administration', true),
  ('React Front-End Developer Certificate', 'Meta', 'React', 'react', 'Build interactive component-driven Web applications using React hooks, state management, and modern JS.', 'Beginner', '5 weeks', 'https://www.coursera.org/professional-certificates/meta-front-end-developer', true),
  ('Node.js API & Backend Development', 'LinkedIn Learning', 'Node.js', 'node.js', 'Design scalable RESTful APIs, asynchronous event loops, and middleware architectures in Node.js.', 'Intermediate', '4 hours', 'https://www.linkedin.com/learning/node-js-essential-training-2', true),
  ('Python for Data Science & AI', 'IBM', 'Python', 'python', 'Learn Python programming, pandas data structures, NumPy arrays, and core AI algorithms.', 'Beginner', '4 weeks', 'https://www.coursera.org/learn/python-for-applied-data-science-ai', true),
  ('Machine Learning Essentials', 'Stanford / DeepLearning.AI', 'Machine Learning', 'machine learning', 'Learn supervised learning, linear regression, neural networks, and decision trees.', 'Intermediate', '6 weeks', 'https://www.coursera.org/specializations/machine-learning-introduction', true),
  ('Cybersecurity & Threat Defense', 'Google', 'Cybersecurity', 'cybersecurity', 'Understand vulnerability assessments, network defense, encryption standards, and incident response.', 'Beginner', '5 weeks', 'https://www.coursera.org/professional-certificates/google-cybersecurity', true),
  ('Git & GitHub Version Control', 'Google', 'Git', 'git', 'Master branch management, pull requests, merge conflict resolution, and collaborative workflows.', 'Beginner', '2 weeks', 'https://www.coursera.org/learn/introduction-git-github', true),
  ('Project Management Professional (PMP) Prep', 'Google', 'Project Management', 'project management', 'Learn Agile methodologies, project scoping, risk management, and stakeholder communication.', 'Beginner', '6 weeks', 'https://www.coursera.org/professional-certificates/google-project-management', true)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
