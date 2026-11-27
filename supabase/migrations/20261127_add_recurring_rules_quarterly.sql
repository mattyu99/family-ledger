-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：擴充 recurring_rules.frequency CHECK 約束以支援每季 (quarterly)
-- 目的：確保前端支援的每季固定帳單能順利寫入與還原至 Supabase 雲端資料庫
-- 日期：2026-11-27
-- ==============================================================================

ALTER TABLE public.recurring_rules
    DROP CONSTRAINT IF EXISTS recurring_rules_frequency_check;

ALTER TABLE public.recurring_rules
    ADD CONSTRAINT recurring_rules_frequency_check
    CHECK (frequency IN ('monthly', 'bimonthly', 'quarterly', 'yearly'));

INSERT INTO public.schema_migrations (version, description)
VALUES ('20261127_add_recurring_rules_quarterly', '擴充 recurring_rules.frequency 支援每季 (quarterly) 週期帳單')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
