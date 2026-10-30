-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：跨裝置即時推播與小工具背景同步 (Cross-Device Push Notifications)
-- 目的：為 member_devices 資料表新增 push_token 欄位，記錄各裝置之 Expo Push Token
-- 日期：2026-10-30
-- ==============================================================================

-- 1. 補齊 member_devices 之 push_token 欄位
ALTER TABLE public.member_devices ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 2. 登記本遷移腳本至版本履歷表
INSERT INTO public.schema_migrations (version, description)
VALUES ('20261030_add_push_token_to_member_devices', '為 member_devices 新增 push_token 欄位以支援跨裝置即時推播與小工具背景同步')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- 3. 查詢確認
SELECT version, applied_at, description 
FROM public.schema_migrations 
ORDER BY applied_at DESC 
LIMIT 3;

