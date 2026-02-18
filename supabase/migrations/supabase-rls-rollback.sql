-- ============================================================
-- Supabase RLS Security Fixes — ROLLBACK
-- Instance: xabrmsgijevedzvvejpv
-- Use this if anything breaks after applying supabase-rls-fixes.sql
-- ============================================================

-- --------------------------------------------------------
-- Rollback Part 1: Disable RLS on bjc-pdf-to-hl7 tables
-- --------------------------------------------------------

DROP POLICY IF EXISTS "anon_read" ON "bjc-pdf-to-hl7".referrals;
DROP POLICY IF EXISTS "service_write" ON "bjc-pdf-to-hl7".referrals;
DROP POLICY IF EXISTS "service_update" ON "bjc-pdf-to-hl7".referrals;
ALTER TABLE "bjc-pdf-to-hl7".referrals DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read" ON "bjc-pdf-to-hl7".extractions;
DROP POLICY IF EXISTS "service_write" ON "bjc-pdf-to-hl7".extractions;
DROP POLICY IF EXISTS "service_update" ON "bjc-pdf-to-hl7".extractions;
ALTER TABLE "bjc-pdf-to-hl7".extractions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read" ON "bjc-pdf-to-hl7".app_settings;
DROP POLICY IF EXISTS "service_write" ON "bjc-pdf-to-hl7".app_settings;
ALTER TABLE "bjc-pdf-to-hl7".app_settings DISABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- Rollback Part 2: Reset function search paths
-- --------------------------------------------------------

ALTER FUNCTION public.update_updated_at_column() RESET search_path;
ALTER FUNCTION public.update_app_settings_updated_at() RESET search_path;
ALTER FUNCTION "bjc-pdf-to-hl7".update_updated_at() RESET search_path;

-- --------------------------------------------------------
-- Rollback Part 3: Restore original permissive policies
-- --------------------------------------------------------

DROP POLICY IF EXISTS "service_role_only" ON public.app_settings;
CREATE POLICY "Allow all operations on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_write" ON public.zoom_webhook_logs;
CREATE POLICY "Allow webhook inserts" ON public.zoom_webhook_logs FOR INSERT WITH CHECK (true);
