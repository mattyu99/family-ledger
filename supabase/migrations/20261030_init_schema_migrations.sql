-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：資料庫版本履歷管理系統 (Database Schema Migration Tracking)
-- 目的：建立 public.schema_migrations 表，精確記錄與查詢所有已執行的資料庫遷移
-- 日期：2026-10-30
-- ==============================================================================

-- 1. 建立遷移版本履歷表
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    description TEXT
);

-- 2. 啟用 RLS 並開放唯讀查詢（任何授權角色與 anon 皆可透明查詢當前版本）
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read access on schema_migrations" ON public.schema_migrations;
CREATE POLICY "Allow read access on schema_migrations" ON public.schema_migrations FOR SELECT
  USING (true);

-- 3. 補登現已上線生效之歷史版本
INSERT INTO public.schema_migrations (version, description)
VALUES 
    ('00000000_baseline_schema', '系統全量基準綱要 (Initial Schema)'),
    ('20261030_zero_token_architecture', '零金鑰安全架構、全域 RLS 放行與 14 大核心預存程序')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- 4. 立即驗證已套用之版本履歷
SELECT version, applied_at, description 
FROM public.schema_migrations 
ORDER BY applied_at DESC;

