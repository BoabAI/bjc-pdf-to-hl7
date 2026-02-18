-- ============================================================
-- Supabase RLS Security Fixes
-- Instance: xabrmsgijevedzvvejpv
-- Date: 2026-02-18
-- Risk: LOW — all app code uses service_role key (bypasses RLS)
-- Rollback: docs/supabase-rls-rollback.sql
-- ============================================================

-- --------------------------------------------------------
-- Part 1: Enable RLS on bjc-pdf-to-hl7 tables (3 errors)
-- --------------------------------------------------------

ALTER TABLE "bjc-pdf-to-hl7".referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bjc-pdf-to-hl7".extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bjc-pdf-to-hl7".app_settings ENABLE ROW LEVEL SECURITY;

-- Policies: anon can SELECT (future-proofs for createBrowserClient), writes restricted to service_role

CREATE POLICY "anon_read" ON "bjc-pdf-to-hl7".referrals FOR SELECT USING (true);
CREATE POLICY "service_write" ON "bjc-pdf-to-hl7".referrals FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update" ON "bjc-pdf-to-hl7".referrals FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "anon_read" ON "bjc-pdf-to-hl7".extractions FOR SELECT USING (true);
CREATE POLICY "service_write" ON "bjc-pdf-to-hl7".extractions FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update" ON "bjc-pdf-to-hl7".extractions FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "anon_read" ON "bjc-pdf-to-hl7".app_settings FOR SELECT USING (true);
CREATE POLICY "service_write" ON "bjc-pdf-to-hl7".app_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- --------------------------------------------------------
-- Part 2: Fix function search paths (3 warnings)
-- --------------------------------------------------------

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_app_settings_updated_at() SET search_path = public;
ALTER FUNCTION "bjc-pdf-to-hl7".update_updated_at() SET search_path = 'bjc-pdf-to-hl7';

-- --------------------------------------------------------
-- Part 3: Fix overly permissive policies (2 warnings)
-- --------------------------------------------------------

-- public.app_settings: restrict from "allow all" to service_role only
DROP POLICY "Allow all operations on app_settings" ON public.app_settings;
CREATE POLICY "service_role_only" ON public.app_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- public.zoom_webhook_logs: restrict from open inserts to service_role only
DROP POLICY "Allow webhook inserts" ON public.zoom_webhook_logs;
CREATE POLICY "service_write" ON public.zoom_webhook_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- --------------------------------------------------------
-- Part 4: Leaked password protection (MANUAL)
-- --------------------------------------------------------
-- Go to: Supabase Dashboard > Authentication > Settings
-- Enable "Leaked password protection"
