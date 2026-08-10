-- supabase/microcredentials_schema.sql
-- SkillSync — Controlled Microcredentials Catalog Schema & RLS Policies

-- 1. Create Controlled Microcredential Catalog Table
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

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_microcredentials_canonical_skill
  ON public.microcredentials_catalog(canonical_skill);

CREATE INDEX IF NOT EXISTS idx_microcredentials_active
  ON public.microcredentials_catalog(is_active);

-- 3. Row Level Security (RLS)
ALTER TABLE public.microcredentials_catalog ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view active microcredentials" ON public.microcredentials_catalog;
DROP POLICY IF EXISTS "Admins can manage microcredentials" ON public.microcredentials_catalog;

-- Policy: Candidates, employers, and public users can READ active microcredentials
CREATE POLICY "Anyone can view active microcredentials"
ON public.microcredentials_catalog
FOR SELECT
TO public, authenticated
USING (is_active = true);

-- Policy: Only Admins can INSERT, UPDATE, or DELETE catalog items
CREATE POLICY "Admins can manage microcredentials"
ON public.microcredentials_catalog
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_platform_admin = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_platform_admin = true)
  )
);

-- 4. Sample Controlled Catalog Seed Data (Idempotent)
-- Run this block if you wish to seed the live database with initial curated credentials.
/*
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
*/
