-- ==============================================================================
-- 遷移：為 ledger_members 新增 custom_name 與 custom_avatar 支援各帳本專屬獨立稱謂
-- ==============================================================================

ALTER TABLE public.ledger_members ADD COLUMN IF NOT EXISTS custom_name TEXT;
ALTER TABLE public.ledger_members ADD COLUMN IF NOT EXISTS custom_avatar TEXT;

COMMENT ON COLUMN public.ledger_members.custom_name IS '成員在此帳本的專屬暱稱/稱謂（為 NULL 則採用 profiles.display_name）';
COMMENT ON COLUMN public.ledger_members.custom_avatar IS '成員在此帳本的專屬頭像（為 NULL 則採用 profiles.avatar_url）';
