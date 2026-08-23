-- ==============================================================================
-- SkillSync Migration: Fix Anon Execution Grant on is_platform_admin()
-- Migration: 20260825030000_fix_anon_admin_helper_grant.sql
-- ==============================================================================
-- Allows anonymous queries against public tables (e.g. jobs) to evaluate
-- RLS policies containing is_platform_admin() without throwing 42501.
-- When auth.uid() is NULL, is_platform_admin() safely returns FALSE.
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon, service_role;
