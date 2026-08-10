-- supabase/phase_10_qa_fixes_certificates_storage_rls.sql
-- SkillSync — Phase 10 Certificates Private Storage RLS Policies

-- 1. Ensure certificates bucket remains PRIVATE
UPDATE storage.buckets SET public = false WHERE id = 'certificates';

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS "Candidates can upload own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Candidates can view own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Candidates can update own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Candidates can delete own certificates" ON storage.objects;

-- 3. INSERT Policy: Authenticated candidate can upload ONLY to certificates/<auth.uid()>/...
CREATE POLICY "Candidates can upload own certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 4. SELECT Policy: Authenticated candidate can view ONLY certificates/<auth.uid()>/...
CREATE POLICY "Candidates can view own certificates"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 5. UPDATE Policy: Authenticated candidate can update/upsert ONLY certificates/<auth.uid()>/...
CREATE POLICY "Candidates can update own certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 6. DELETE Policy: Authenticated candidate can delete ONLY certificates/<auth.uid()>/...
CREATE POLICY "Candidates can delete own certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
