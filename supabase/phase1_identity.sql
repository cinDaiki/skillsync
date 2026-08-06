-- Phase 1: Identity Verification & Profile Updates

-- Add columns for Identity Verification to the profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'Pending Verification';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_image_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS selfie_image_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_date timestamptz;

-- Note: The administrator will need to create 'verifications' and 'certificates' buckets in Supabase Storage via the dashboard, 
-- or we can provide the SQL for bucket creation (requires superuser access, usually easier via UI).

-- If running as superuser, you can create the buckets via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('verifications', 'verifications', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false) ON CONFLICT DO NOTHING;
