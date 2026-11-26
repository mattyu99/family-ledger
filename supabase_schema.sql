-- ==============================================================================
-- 家庭共同記帳 APP (Family Ledger) - Supabase 資料庫建置腳本 (PostgreSQL + RLS)
-- ==============================================================================

-- 啟用 UUID 擴充功能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. 資料庫版本履歷管理表 (追蹤與查詢所有已執行的資料庫遷移腳本)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    description TEXT
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read access on schema_migrations" ON public.schema_migrations;
CREATE POLICY "Allow read access on schema_migrations" ON public.schema_migrations FOR SELECT
  USING (true);

-- 1. 使用者個人資料表 (支援登入使用者與家庭無帳號成員)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 移除 profiles 對 auth.users 的強制外鍵約束，允許家庭公帳建立無獨立登入帳號的家庭成員 (如長輩、小孩)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 1.1 獨立連線通行證表 (支援 Google 身分安全對齊與換機不產生重複分身)
CREATE TABLE IF NOT EXISTS public.auth_session_links (
    session_uid UUID PRIMARY KEY,
    auth_email TEXT NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_session_links_email
    ON public.auth_session_links (lower(auth_email));

ALTER TABLE public.auth_session_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own session links" ON public.auth_session_links;
CREATE POLICY "Users can view own session links"
    ON public.auth_session_links
    FOR SELECT
    USING (session_uid = auth.uid());

-- 2. 帳本表 (支援個人私帳與家庭公帳)
CREATE TABLE IF NOT EXISTS public.ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    currency TEXT DEFAULT 'TWD' NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 為 ledgers 表新增 admin_pin 欄位（管理員 4 位數安全碼，預設 8888）
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS admin_pin TEXT DEFAULT '8888';

-- 為 ledgers 表新增 is_read_only 欄位（唯讀封存保護模式，預設 FALSE）
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN DEFAULT FALSE;

-- 為 ledgers 表新增 allow_new_members 欄位（家庭門禁安全鎖：允許新成員加入，預設 TRUE）
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS allow_new_members BOOLEAN DEFAULT TRUE;

-- 3. 帳本成員關聯表 (角色與權限)
CREATE TABLE IF NOT EXISTS public.ledger_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('owner', 'admin', 'member', 'viewer')) DEFAULT 'member' NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    custom_name TEXT, -- 成員在此帳本的專屬稱謂 (為 NULL 則採用 profiles.display_name)
    custom_avatar TEXT, -- 成員在此帳本的專屬頭像 (為 NULL 則採用 profiles.avatar_url)
    UNIQUE (ledger_id, user_id)
);

-- 支援既有資料庫向下相容擴充
ALTER TABLE public.ledger_members ADD COLUMN IF NOT EXISTS custom_name TEXT;
ALTER TABLE public.ledger_members ADD COLUMN IF NOT EXISTS custom_avatar TEXT;

-- 4. 記帳分類表
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID REFERENCES public.ledgers(id) ON DELETE CASCADE, -- 若為 NULL 則為系統預設通用分類
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'receipt' NOT NULL,
    color TEXT DEFAULT '#4F46E5' NOT NULL,
    type TEXT CHECK (type IN ('expense', 'income')) DEFAULT 'expense' NOT NULL,
    sort_order INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. 交易明細表記帳主表
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT CHECK (type IN ('expense', 'income', 'transfer', 'memo')) DEFAULT 'expense' NOT NULL,
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- 實際付款人
    merchant TEXT, -- 店家 / 付款對象 (選填)
    transacted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    note TEXT,
    image_url TEXT, -- 收據或發票照片網址
    is_settled BOOLEAN DEFAULT FALSE NOT NULL, -- 款項是否已結清
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 為 transactions 表新增 merchant 欄位（店家/付款對象）
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS merchant TEXT;

-- 為 transactions 表新增 payment_method (付款方式), account_id (卡片/帳戶ID), is_reconciled (是否已對帳)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN DEFAULT FALSE;

-- 為 transactions 表新增生活備忘與待辦延伸欄位：completed_by (辦妥人), completed_at (辦妥時間), reminder_date (提醒日期), completion_note (辦妥說明), linked_transaction_id (連動之支出或記事 ID), reminder_target (提醒對象範圍)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reminder_date TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reminder_target TEXT DEFAULT 'family';

-- 確保 Supabase Realtime DELETE 事件包含完整欄位（含 ledger_id 與 id），防止 RLS 阻斷 DELETE 推播
ALTER TABLE public.transactions REPLICA IDENTITY FULL;

-- 放寬 transactions.type 支援 'memo' (生活記事手帳)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
    CHECK (type IN ('expense', 'income', 'transfer', 'memo'));

-- 建立交易明細高效能複合索引 (大幅加速海量歷史帳本載入與排序，消弭全表掃描)
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_transacted 
    ON public.transactions(ledger_id, transacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_updated 
    ON public.transactions(ledger_id, updated_at DESC);

-- 自動維護 transactions.updated_at 時間戳觸發器
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_transactions_updated_at ON public.transactions;
CREATE TRIGGER tr_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- 6. 付款卡片與資產帳戶表 (信用卡、悠遊卡、儲值錢包)
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 如：富邦 Costco 卡, 國泰 CUBE 卡, 爸爸悠遊卡
    type TEXT CHECK (type IN ('credit_card', 'stored_value', 'cash', 'bank', 'carrier', 'other')) NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- 持卡人 / 歸屬成員
    last_four_digits TEXT, -- 末四碼 (如 8829)
    card_number TEXT, -- 完整卡號 (悠遊卡/一卡通 10~16 碼，供官網查帳與一鍵複製)
    issuer_bank TEXT, -- 發卡銀行/機構識別（用於同銀行多卡歸戶對帳）
    billing_cycle_date INT CHECK (billing_cycle_date BETWEEN 1 AND 31), -- 結帳日 (每月 1~31 號)
    payment_due_day INT CHECK (payment_due_day BETWEEN 1 AND 31), -- 繳款截止日 (每月 1~31 號)
    balance NUMERIC(12, 2) DEFAULT 0 NOT NULL, -- 儲值卡/帳戶餘額 (悠遊卡使用)
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT '💳',
    sort_order INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. 分帳/拆帳明細表 (共同分攤)
CREATE TABLE IF NOT EXISTS public.transaction_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- 應分攤的成員
    split_amount NUMERIC(12, 2) NOT NULL, -- 應負擔的金額
    is_settled BOOLEAN DEFAULT FALSE NOT NULL,
    settled_at TIMESTAMPTZ
);

-- 8. 帳本邀請碼表 (家人快速加入)
CREATE TABLE IF NOT EXISTS public.ledger_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    invite_code TEXT UNIQUE NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INT DEFAULT 10,
    used_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 安全機制：Row Level Security (RLS 行級權限控制)
-- 只有帳本成員能讀取、新增、修改該帳本的任何資料，防止跨家庭外洩
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_invites ENABLE ROW LEVEL SECURITY;

-- 檢查當前登入者是否屬於特定帳本成員的輔助函式（包含建立者、已加入成員、已綁定同 Google 帳號之受保護成員，以及 auth_session_links 授權）
CREATE OR REPLACE FUNCTION public.is_ledger_member(target_ledger_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    IF target_ledger_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 官方示範帳本 (SWEETHOME) 永遠放行
    IF target_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN
        RETURN TRUE;
    END IF;

    -- 1. 當前連線直接為該帳本成員或建立者
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_id = target_ledger_id AND user_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE id = target_ledger_id AND created_by = auth.uid()
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 2. 依序從 auth_session_links -> profiles (locked) -> auth.jwt() 解析已認證 Google 信箱
    IF auth.uid() IS NOT NULL THEN
        SELECT lower(trim(auth_email)) INTO v_user_email
        FROM public.auth_session_links
        WHERE session_uid = auth.uid()
        LIMIT 1;

        IF v_user_email IS NULL OR v_user_email = '' THEN
            SELECT lower(trim(auth_email)) INTO v_user_email
            FROM public.profiles
            WHERE id = auth.uid() AND auth_email IS NOT NULL AND is_locked = true
            LIMIT 1;
        END IF;
    END IF;

    IF v_user_email IS NULL OR v_user_email = '' THEN
        v_user_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    END IF;

    -- 3. 若具合法非虛擬信箱，檢查目標帳本中是否有屬於該信箱的成員或建立者
    IF v_user_email IS NOT NULL
       AND v_user_email <> ''
       AND position('@' in v_user_email) > 0
       AND right(v_user_email, 13) <> '@family.local'
       AND v_user_email NOT LIKE '%anonymous%'
    THEN
        IF EXISTS (
            SELECT 1 FROM public.ledger_members lm
            JOIN public.profiles p ON lm.user_id = p.id
            WHERE lm.ledger_id = target_ledger_id
              AND p.auth_email IS NOT NULL
              AND lower(trim(p.auth_email)) = v_user_email
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers l
            JOIN public.profiles p ON l.created_by = p.id
            WHERE l.id = target_ledger_id
              AND p.auth_email IS NOT NULL
              AND lower(trim(p.auth_email)) = v_user_email
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_ledger_member(UUID) TO anon, authenticated, service_role;

-- 檢查當前連線或已認證成員是否具備目標帳本之管理員/擁有者 (owner/admin) 權限
CREATE OR REPLACE FUNCTION public.is_ledger_admin(target_ledger_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    IF target_ledger_id IS NULL OR auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. 直接比對建立者或 owner/admin 成員
    IF EXISTS (
        SELECT 1 FROM public.ledgers
        WHERE id = target_ledger_id AND created_by = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.ledger_members
        WHERE ledger_id = target_ledger_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. 依序從 auth_session_links -> profiles (locked) -> auth.jwt() 解析已認證 Google 信箱
    SELECT lower(trim(auth_email)) INTO v_user_email
    FROM public.auth_session_links
    WHERE session_uid = auth.uid()
    LIMIT 1;

    IF v_user_email IS NULL OR v_user_email = '' THEN
        SELECT lower(trim(auth_email)) INTO v_user_email
        FROM public.profiles
        WHERE id = auth.uid() AND auth_email IS NOT NULL AND is_locked = true
        LIMIT 1;
    END IF;

    IF v_user_email IS NULL OR v_user_email = '' THEN
        v_user_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    END IF;

    -- 3. 檢查目標帳本中對應信箱是否具備建立者或管理員身份
    IF v_user_email IS NOT NULL
       AND v_user_email <> ''
       AND position('@' in v_user_email) > 0
       AND right(v_user_email, 13) <> '@family.local'
       AND v_user_email NOT LIKE '%anonymous%'
    THEN
        IF EXISTS (
            SELECT 1 FROM public.ledgers l
            JOIN public.profiles p ON l.created_by = p.id
            WHERE l.id = target_ledger_id
              AND p.auth_email IS NOT NULL
              AND lower(trim(p.auth_email)) = v_user_email
        ) OR EXISTS (
            SELECT 1 FROM public.ledger_members lm
            JOIN public.profiles p ON lm.user_id = p.id
            WHERE lm.ledger_id = target_ledger_id
              AND lm.role IN ('owner', 'admin')
              AND p.auth_email IS NOT NULL
              AND lower(trim(p.auth_email)) = v_user_email
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_ledger_admin(UUID) TO anon, authenticated, service_role;

-- Profiles 規則：任何人可讀取個人公開資訊，已認證成員可新增與修改
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
CREATE POLICY "Anyone can insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
CREATE POLICY "Anyone can update profiles" ON public.profiles 
  FOR UPDATE USING (
    id = auth.uid() 
    OR (auth_email IS NOT NULL AND lower(auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    OR NOT is_locked
  );

-- Ledgers 規則：只有成員與建立者能看自己參與的帳本
DROP POLICY IF EXISTS "Members can view their ledgers" ON public.ledgers;
CREATE POLICY "Members can view their ledgers" ON public.ledgers FOR SELECT 
  USING (public.is_ledger_member(id));

DROP POLICY IF EXISTS "Users can create ledgers" ON public.ledgers;
CREATE POLICY "Users can create ledgers" ON public.ledgers FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Owners can update ledgers" ON public.ledgers;
CREATE POLICY "Owners can update ledgers" ON public.ledgers FOR UPDATE 
  USING (public.is_ledger_member(id));

-- Ledger Members 規則
DROP POLICY IF EXISTS "Members can view ledger members" ON public.ledger_members;
CREATE POLICY "Members can view ledger members" ON public.ledger_members FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Members can insert ledger members" ON public.ledger_members;
CREATE POLICY "Members can insert ledger members" ON public.ledger_members FOR INSERT 
  WITH CHECK (
    user_id = auth.uid() 
    OR public.is_ledger_member(ledger_id)
  );

DROP POLICY IF EXISTS "Admins/Owners can manage members" ON public.ledger_members;
CREATE POLICY "Admins/Owners can manage members" ON public.ledger_members FOR ALL 
  USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Users can leave ledger" ON public.ledger_members;
CREATE POLICY "Users can leave ledger" ON public.ledger_members FOR DELETE 
  USING (user_id = auth.uid());

-- Categories 規則
DROP POLICY IF EXISTS "Members can view categories" ON public.categories;
CREATE POLICY "Members can view categories" ON public.categories FOR SELECT 
  USING (ledger_id IS NULL OR public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Members can manage categories" ON public.categories;
CREATE POLICY "Members can manage categories" ON public.categories FOR ALL 
  USING (public.is_ledger_member(ledger_id));

-- Transactions 規則：只有成員能看與增修帳目
DROP POLICY IF EXISTS "Members can view transactions" ON public.transactions;
CREATE POLICY "Members can view transactions" ON public.transactions FOR SELECT 
  USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
CREATE POLICY "Members can insert transactions" ON public.transactions FOR INSERT 
  WITH CHECK (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Members can update transactions" ON public.transactions;
CREATE POLICY "Members can update transactions" ON public.transactions FOR UPDATE 
  USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Members can delete transactions" ON public.transactions;
CREATE POLICY "Members can delete transactions" ON public.transactions FOR DELETE 
  USING (public.is_ledger_member(ledger_id));

-- Payment Accounts 規則：只有成員能看與增修卡片帳戶
DROP POLICY IF EXISTS "Members can view payment accounts" ON public.payment_accounts;
CREATE POLICY "Members can view payment accounts" ON public.payment_accounts FOR SELECT 
  USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Members can manage payment accounts" ON public.payment_accounts;
CREATE POLICY "Members can manage payment accounts" ON public.payment_accounts FOR ALL 
  USING (public.is_ledger_member(ledger_id));

-- Splits 規則
DROP POLICY IF EXISTS "Members can view splits" ON public.transaction_splits;
CREATE POLICY "Members can view splits" ON public.transaction_splits FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_splits.transaction_id AND public.is_ledger_member(t.ledger_id)));

DROP POLICY IF EXISTS "Members can manage splits" ON public.transaction_splits;
CREATE POLICY "Members can manage splits" ON public.transaction_splits FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_splits.transaction_id AND public.is_ledger_member(t.ledger_id)));

-- Invites 規則 (允許持有邀請碼的家人驗證邀請碼)
DROP POLICY IF EXISTS "Members can view ledger invites" ON public.ledger_invites;
DROP POLICY IF EXISTS "Anyone can verify invite code" ON public.ledger_invites;
CREATE POLICY "Anyone can verify invite code" ON public.ledger_invites FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Admins can manage invites" ON public.ledger_invites;
CREATE POLICY "Admins can manage invites" ON public.ledger_invites FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.ledger_members lm WHERE lm.ledger_id = ledger_invites.ledger_id AND lm.user_id = auth.uid() AND lm.role IN ('owner', 'admin')));

-- 家人透過邀請碼加入帳本的 RPC 函式 (SECURITY DEFINER 確保安全並自動完成關聯)
DROP FUNCTION IF EXISTS public.join_ledger_by_invite(TEXT);
DROP FUNCTION IF EXISTS public.join_ledger_by_invite(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.join_ledger_by_invite(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.join_ledger_by_invite(
    invite_code_input TEXT,
    claimed_role TEXT DEFAULT NULL,
    admin_pin_input TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    target_invite RECORD;
    target_ledger RECORD;
    assigned_role TEXT;
    expected_pin TEXT;
BEGIN
    SELECT * INTO target_invite FROM public.ledger_invites
    WHERE UPPER(TRIM(invite_code)) = UPPER(TRIM(invite_code_input))
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF NOT FOUND THEN
        BEGIN
            SELECT * INTO target_ledger FROM public.ledgers WHERE id = invite_code_input::UUID;
        EXCEPTION WHEN others THEN
            target_ledger := NULL;
        END;

        IF target_ledger IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', '找不到此邀請碼或邀請碼已失效');
        END IF;
    ELSE
        SELECT * INTO target_ledger FROM public.ledgers WHERE id = target_invite.ledger_id;
    END IF;

    -- 門禁安全鎖檢查：若帳本已關閉新成員加入，且呼叫者既非建立者也非既有成員，則阻斷加入
    IF COALESCE(target_ledger.allow_new_members, TRUE) = FALSE THEN
        IF (target_ledger.created_by IS NULL OR target_ledger.created_by != auth.uid()) AND NOT EXISTS (
            SELECT 1 FROM public.ledger_members 
            WHERE ledger_id = target_ledger.id AND user_id = auth.uid()
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'is_gate_locked', true,
                'message', '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！'
            );
        END IF;
    END IF;

    -- 若目前呼叫者為該帳本建立者，角色自動恢復為 'owner'
    IF target_ledger.created_by = auth.uid() THEN
        assigned_role := 'owner';
    ELSIF claimed_role IN ('owner', 'admin') THEN
        expected_pin := COALESCE(target_ledger.admin_pin, '8888');
        IF expected_pin != '' AND expected_pin != COALESCE(TRIM(admin_pin_input), '') THEN
            RETURN jsonb_build_object('success', false, 'message', '管理員安全 PIN 碼錯誤，無法取得管理員權限！');
        END IF;
        assigned_role := claimed_role;
    ELSE
        assigned_role := 'member';
    END IF;

    -- 先嘗試更新既有成員紀錄之角色
    UPDATE public.ledger_members
    SET role = assigned_role
    WHERE ledger_id = target_ledger.id AND user_id = auth.uid();

    -- 若尚未加入過，則新增成員紀錄（防幽靈假人：若帳本已有具名成員，嚴禁以預設「家庭成員」直接插入）
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM public.ledger_members lm
            JOIN public.profiles p ON p.id = lm.user_id
            WHERE lm.ledger_id = target_ledger.id AND p.display_name != '家庭成員' AND TRIM(COALESCE(p.display_name, '')) != ''
        ) AND EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.display_name = '家庭成員' OR TRIM(COALESCE(p.display_name, '')) = '')
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'ledger_id', target_ledger.id,
                'ledger_name', target_ledger.name,
                'requires_identity', true,
                'message', '請先選擇或輸入您在家庭中的稱謂'
            );
        END IF;

        INSERT INTO public.ledger_members (ledger_id, user_id, role)
        VALUES (target_ledger.id, auth.uid(), assigned_role);
    END IF;

    -- 累加已使用次數
    IF target_invite.id IS NOT NULL THEN
        UPDATE public.ledger_invites
        SET used_count = used_count + 1
        WHERE id = target_invite.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', target_ledger.id,
        'ledger_name', target_ledger.name,
        'assigned_role', assigned_role,
        'invite_code', COALESCE(target_invite.invite_code, invite_code_input)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.join_ledger_by_invite(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 修改管理員安全 PIN 碼的 RPC 函式 (僅限 Owner/Admin 操作)
DROP FUNCTION IF EXISTS public.update_admin_pin(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_admin_pin(
    target_ledger_id UUID,
    new_pin TEXT
)
RETURNS JSONB AS $$
DECLARE
    clean_pin TEXT := TRIM(new_pin);
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.ledger_members 
        WHERE ledger_id = target_ledger_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    ) AND (SELECT created_by FROM public.ledgers WHERE id = target_ledger_id) != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'message', '只有帳本管理員才能修改安全 PIN 碼');
    END IF;

    IF length(clean_pin) < 4 OR length(clean_pin) > 8 THEN
        RETURN jsonb_build_object('success', false, 'message', 'PIN 碼長度需在 4 至 8 碼之間');
    END IF;

    UPDATE public.ledgers
    SET admin_pin = clean_pin
    WHERE id = target_ledger_id;

    RETURN jsonb_build_object('success', true, 'pin', clean_pin);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_admin_pin(UUID, TEXT) TO anon, authenticated;

-- 切換家庭門禁安全鎖 (僅限 Owner/Admin 操作)
DROP FUNCTION IF EXISTS public.update_allow_new_members(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_allow_new_members(
    target_ledger_id UUID,
    is_allowed BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.ledger_members 
        WHERE ledger_id = target_ledger_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    ) AND (SELECT created_by FROM public.ledgers WHERE id = target_ledger_id) != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'message', '只有帳本管理員才能調整門禁安全設定');
    END IF;

    UPDATE public.ledgers
    SET allow_new_members = is_allowed
    WHERE id = target_ledger_id;

    RETURN jsonb_build_object('success', true, 'allow_new_members', is_allowed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_allow_new_members(UUID, BOOLEAN) TO anon, authenticated;

-- 取得帳本邀請預覽與成員名冊 (SECURITY DEFINER 供訪客在加入前預覽帳本資訊與認領成員)
DROP FUNCTION IF EXISTS public.get_ledger_invite_preview(TEXT);

CREATE OR REPLACE FUNCTION public.get_ledger_invite_preview(invite_code_input TEXT)
RETURNS JSONB AS $$
DECLARE
    target_invite RECORD;
    target_ledger RECORD;
    members_json JSONB;
BEGIN
    -- 1. 先嘗試以邀請碼比對 (不分大小寫)
    SELECT * INTO target_invite FROM public.ledger_invites
    WHERE UPPER(TRIM(invite_code)) = UPPER(TRIM(invite_code_input))
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF FOUND THEN
        SELECT * INTO target_ledger FROM public.ledgers WHERE id = target_invite.ledger_id;
    ELSE
        -- 2. 備用：若傳入的是 ledger UUID
        BEGIN
            SELECT * INTO target_ledger FROM public.ledgers WHERE id = invite_code_input::UUID;
        EXCEPTION WHEN others THEN
            target_ledger := NULL;
        END;
    END IF;

    IF target_ledger IS NULL OR target_ledger.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到此邀請碼對應的帳本或邀請碼已失效');
    END IF;

    -- 門禁安全鎖檢查：若帳本已關閉新成員加入，且呼叫者既非建立者也非既有成員，直接阻斷預覽，保護成員名冊絕不外洩
    IF COALESCE(target_ledger.allow_new_members, TRUE) = FALSE THEN
        IF (target_ledger.created_by IS NULL OR target_ledger.created_by != auth.uid()) AND NOT EXISTS (
            SELECT 1 FROM public.ledger_members 
            WHERE ledger_id = target_ledger.id AND user_id = auth.uid()
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'is_gate_locked', true,
                'ledger_name', target_ledger.name,
                'message', '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！'
            );
        END IF;
    END IF;

    -- 3. 查詢該帳本既有成員清單 (依 display_name 去重，保留最早加入者)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sub.id,
                'display_name', sub.display_name,
                'avatar_url', sub.avatar_url,
                'role', sub.role
            ) ORDER BY sub.joined_at ASC
        ), '[]'::jsonb
    ) INTO members_json
    FROM (
        SELECT DISTINCT ON (p.display_name)
            p.id,
            p.display_name,
            p.avatar_url,
            lm.role,
            lm.joined_at
        FROM public.ledger_members lm
        JOIN public.profiles p ON lm.user_id = p.id
        WHERE lm.ledger_id = target_ledger.id
        ORDER BY p.display_name, lm.joined_at ASC
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', target_ledger.id,
        'ledger_name', target_ledger.name,
        'invite_code', COALESCE(target_invite.invite_code, invite_code_input),
        'members', members_json
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_ledger_invite_preview(TEXT) TO anon, authenticated;

-- 新增家庭成員的 RPC 函式 (SECURITY DEFINER 原子交易，自動寫入 profiles 與 ledger_members)
DROP FUNCTION IF EXISTS public.add_family_member(UUID, TEXT);
DROP FUNCTION IF EXISTS public.add_family_member(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.add_family_member(
    target_ledger_id UUID,
    member_name TEXT,
    member_avatar TEXT DEFAULT '😊'
)
RETURNS JSONB AS $$
DECLARE
    new_member_id UUID := uuid_generate_v4();
BEGIN
    -- 檢查呼叫者是否為該帳本成員
    IF NOT public.is_ledger_member(target_ledger_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '您不是此帳本的成員，無法新增成員');
    END IF;

    -- 1. 寫入 profiles 表
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (new_member_id, member_name, member_avatar);

    -- 2. 寫入 ledger_members 表
    INSERT INTO public.ledger_members (ledger_id, user_id, role)
    VALUES (target_ledger_id, new_member_id, 'member')
    ON CONFLICT (ledger_id, user_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'member', jsonb_build_object(
            'id', new_member_id,
            'display_name', member_name,
            'avatar_url', member_avatar
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_family_member(UUID, TEXT, TEXT) TO anon, authenticated;

-- 變更成員角色權限的 RPC 函式 (管理員可指派共同管理員或降為一般成員)
DROP FUNCTION IF EXISTS public.set_member_role(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.set_member_role(
    target_ledger_id UUID,
    target_user_id UUID,
    new_role TEXT
)
RETURNS JSONB AS $$
DECLARE
    target_ledger RECORD;
BEGIN
    SELECT * INTO target_ledger FROM public.ledgers WHERE id = target_ledger_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到指定的帳本');
    END IF;

    -- 檢查目前呼叫者是否為該帳本管理員或建立者
    IF NOT EXISTS (
        SELECT 1 FROM public.ledger_members 
        WHERE ledger_id = target_ledger_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    ) AND target_ledger.created_by != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'message', '只有帳本管理員才能變更成員權限');
    END IF;

    -- 原始建立者不能被降級
    IF target_ledger.created_by = target_user_id AND new_role != 'owner' THEN
        RETURN jsonb_build_object('success', false, 'message', '帳本原始建立者不能被降為一般成員');
    END IF;

    UPDATE public.ledger_members
    SET role = new_role
    WHERE ledger_id = target_ledger_id AND user_id = target_user_id;

    RETURN jsonb_build_object('success', true, 'role', new_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, UUID, TEXT) TO anon, authenticated;

-- ==============================================================================
-- 自動化觸發器 (Triggers)：新使用者註冊時，自動建立 Profile (由使用者自行建立或加入帳本)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. 建立 Profile
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NULLIF(split_part(NEW.email, '@', 1), ''), '家庭成員'),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '👨')
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 監聽 Supabase 帳號註冊事件
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 安全加入 Realtime 即時推播 (已存在則自動略過，不報錯)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_splits;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_rules;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_accounts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_devices;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;

-- ==============================================================================
-- 終極防護：交易刪除墓碑表 (Tombstone) 與防復活觸發器 (Anti-Resurrection)
-- 徹底防止任何未更新的舊版本客戶端將已刪除明細誤當「未同步交易」重新寫入 (Zombie Resurrect)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.deleted_transactions (
    id UUID PRIMARY KEY,
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    deleted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 啟用 RLS 與開放帳本成員讀寫權限
ALTER TABLE public.deleted_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "帳本成員可檢視墓碑名單" ON public.deleted_transactions;
CREATE POLICY "帳本成員可檢視墓碑名單" ON public.deleted_transactions
    FOR SELECT USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "帳本成員可記錄刪除墓碑" ON public.deleted_transactions;
CREATE POLICY "帳本成員可記錄刪除墓碑" ON public.deleted_transactions
    FOR INSERT WITH CHECK (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "帳本成員可刪除墓碑(還原備份用)" ON public.deleted_transactions;
CREATE POLICY "帳本成員可刪除墓碑(還原備份用)" ON public.deleted_transactions
    FOR DELETE USING (public.is_ledger_member(ledger_id));

-- 1. 當 transactions 有資料被刪除時，自動寫入 deleted_transactions 墓碑表
CREATE OR REPLACE FUNCTION public.log_transaction_deletion()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.deleted_transactions (id, ledger_id)
    VALUES (OLD.id, OLD.ledger_id)
    ON CONFLICT (id) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_log_transaction_deletion ON public.transactions;
CREATE TRIGGER tr_log_transaction_deletion
    BEFORE DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.log_transaction_deletion();

-- 2. 移除阻斷還原的防復活觸發器，確保備份回復（JSON 還原）功能能正常寫入資料
DROP TRIGGER IF EXISTS tr_prevent_transaction_resurrection ON public.transactions;
DROP FUNCTION IF EXISTS public.prevent_transaction_resurrection();

-- ==============================================================================
-- 9. 付款方式 (Payment Methods) 架構說明：
-- transactions.payment_method 欄位為 TEXT 型別，原生支援自訂付款方式代碼：
-- - 系統預設核心代碼：'cash', 'credit_card', 'line_pay', 'px_pay', 'easycard_pay', 'jkopay', 'stored_value', 'transfer'
-- - 使用者自訂代碼：例如 'custom_1728399999999'
-- - 電子支付若綁定信用卡，款項會記錄 transactions.payment_method = 'px_pay' 並在 account_id 記錄信用卡 UUID
-- - 信用卡對帳系統是以 account_id (UUID) 精確過濾，因此所有綁卡交易皆能 100% 正確歸戶與對帳
-- ==============================================================================

-- ==============================================================================
-- 10. 週期扣款與固定帳單規則表 (Recurring Rules)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.recurring_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount_type TEXT CHECK (amount_type IN ('fixed', 'variable')) DEFAULT 'variable' NOT NULL,
    default_amount NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    merchant TEXT,
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payment_method TEXT DEFAULT 'credit_card' NOT NULL,
    account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
    frequency TEXT CHECK (frequency IN ('monthly', 'bimonthly', 'yearly')) DEFAULT 'monthly' NOT NULL,
    due_day INT CHECK (due_day BETWEEN 1 AND 31) DEFAULT 1 NOT NULL,
    bimonthly_start_month INT CHECK (bimonthly_start_month IN (1, 2)),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    last_recorded_period TEXT,
    is_installment BOOLEAN DEFAULT FALSE NOT NULL,
    total_installments INT,
    current_installment INT DEFAULT 1,
    installment_start_period TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 資料庫遷移：若資料表已存在，安全補齊分期付款欄位
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT FALSE;
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS total_installments INT;
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS current_installment INT DEFAULT 1;
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS installment_start_period TEXT;

-- 啟用 RLS
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "成員可讀取所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可讀取所屬帳本的週期規則" ON public.recurring_rules
    FOR SELECT USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "成員可新增所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可新增所屬帳本的週期規則" ON public.recurring_rules
    FOR INSERT WITH CHECK (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "成員可更新所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可更新所屬帳本的週期規則" ON public.recurring_rules
    FOR UPDATE USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "成員可刪除所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可刪除所屬帳本的週期規則" ON public.recurring_rules
    FOR DELETE USING (public.is_ledger_member(ledger_id));

-- 確保 Realtime 事件可用
ALTER TABLE public.recurring_rules REPLICA IDENTITY FULL;

-- ==============================================================================
-- 11. 成員裝置連線與在線感知表 (Member Devices Management)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.member_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    member_id UUID NOT NULL,                     -- 成員 Profile ID (保持相容與防呆，不強制外鍵約束)
    device_id TEXT NOT NULL,                     -- 本機持久化裝置指紋 (UUID)
    device_name TEXT NOT NULL,                   -- 例如 "iPhone 16 Pro", "Pixel 8", "Windows Chrome Web"
    platform TEXT CHECK (platform IN ('ios', 'android', 'web')) NOT NULL,
    app_version TEXT,                            -- 記錄該裝置 App 版本 (例如 "1.0.5.1")
    last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (ledger_id, device_id)
);

-- 若歷史已存在外鍵約束，安全移除外鍵防護以相容自訂/別名成員
ALTER TABLE public.member_devices DROP CONSTRAINT IF EXISTS member_devices_member_id_fkey;

-- 建立索引加速查詢
CREATE INDEX IF NOT EXISTS idx_member_devices_member ON public.member_devices(ledger_id, member_id);
CREATE INDEX IF NOT EXISTS idx_member_devices_device ON public.member_devices(ledger_id, device_id);

-- 啟用 RLS
ALTER TABLE public.member_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "成員可讀取所屬帳本的裝置清單" ON public.member_devices;
DROP POLICY IF EXISTS "成員可登記所屬帳本的裝置" ON public.member_devices;
DROP POLICY IF EXISTS "成員可更新所屬帳本的裝置心跳" ON public.member_devices;
DROP POLICY IF EXISTS "成員可解除所屬帳本的裝置綁定" ON public.member_devices;
DROP POLICY IF EXISTS "成員可管理所屬帳本的裝置" ON public.member_devices;

CREATE POLICY "成員可管理所屬帳本的裝置" ON public.member_devices
    FOR ALL
    USING (public.is_ledger_member(ledger_id));

-- 確保 Realtime 事件可用
ALTER TABLE public.member_devices REPLICA IDENTITY FULL;

-- 🎮 官方示範體驗 (SWEETHOME) 訪客試玩統計架構：
-- 目前透過 member_devices (UNIQUE(ledger_id, device_id)) 原生記錄訪客裝置指紋與平台，免手動資料庫遷移；
-- 若日後欲將示範訪客與家庭裝置完全脫鉤，可執行以下獨立擴充表：
CREATE TABLE IF NOT EXISTS public.demo_tryouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT UNIQUE NOT NULL,
    platform TEXT CHECK (platform IN ('ios', 'android', 'web')) NOT NULL,
    app_version TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_tried_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.demo_tryouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "訪客可匿名打點登記試玩" ON public.demo_tryouts;
CREATE POLICY "訪客可匿名打點登記試玩" ON public.demo_tryouts
    FOR ALL USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ==============================================================================
-- 9. Google 帳號綁定與身分電子鎖欄位擴充 (Phase 2)
-- ==============================================================================
-- 擴充 profiles 資料表以支援 Google 帳號一鍵綁定與身分電子鎖
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'google';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS claim_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS claim_code_expires_at TIMESTAMPTZ;

-- 建立索引加速查詢
CREATE INDEX IF NOT EXISTS idx_profiles_auth_email ON public.profiles(auth_email);
CREATE INDEX IF NOT EXISTS idx_profiles_claim_code ON public.profiles(claim_code);

-- ==============================================================================
-- 10. 雲端帳本總管 RPC 與跨平台穿透管理權限 (Phase 3, v1.0.5.20)
-- 支援 Web 網頁版與手機端同時無障礙盤點、穿透讀取、一鍵清理無用空帳本
-- ==============================================================================

-- 10.1 允許成員讀取所屬帳本基本資訊
DROP POLICY IF EXISTS "Members can view their ledgers" ON public.ledgers;
CREATE POLICY "Members can view their ledgers" ON public.ledgers FOR SELECT 
  USING (public.is_ledger_member(id));

-- 10.2 高效能盤點全體雲端帳本現況與用量統計之 SECURITY DEFINER 函式
CREATE OR REPLACE FUNCTION public.get_all_cloud_ledgers_summary()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    WITH ledger_tx_summary AS (
        SELECT 
            ledger_id, 
            COUNT(*)::INT AS tx_count,
            MAX(transacted_at) AS latest_tx_date
        FROM public.transactions
        GROUP BY ledger_id
    ),
    ledger_mem_summary AS (
        SELECT 
            lm.ledger_id,
            COUNT(*)::INT AS member_count,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'userId', lm.user_id,
                        'displayName', COALESCE(p.display_name, '未命名'),
                        'avatarUrl', COALESCE(p.avatar_url, '👤'),
                        'role', lm.role
                    )
                ) FILTER (WHERE lm.user_id IS NOT NULL),
                '[]'::jsonb
            ) AS members
        FROM public.ledger_members lm
        LEFT JOIN public.profiles p ON p.id = lm.user_id
        GROUP BY lm.ledger_id
    ),
    ledger_inv_summary AS (
        SELECT DISTINCT ON (ledger_id)
            ledger_id,
            invite_code
        FROM public.ledger_invites
        ORDER BY ledger_id, created_at DESC
    ),
    full_ledgers AS (
        SELECT 
            l.id,
            l.name,
            l.description,
            l.created_at,
            l.created_by,
            COALESCE(l.allow_new_members, TRUE) AS allow_new_members,
            COALESCE(inv.invite_code, '') AS invite_code,
            COALESCE(m.member_count, 0) AS member_count,
            COALESCE(m.members, '[]'::jsonb) AS members,
            COALESCE(t.tx_count, 0) AS tx_count,
            t.latest_tx_date,
            (COALESCE(m.member_count, 0) = 0 AND COALESCE(t.tx_count, 0) = 0) AS is_ghost,
            (COALESCE(t.tx_count, 0) = 0 AND COALESCE(m.member_count, 0) <= 1) AS is_test
        FROM public.ledgers l
        LEFT JOIN ledger_tx_summary t ON t.ledger_id = l.id
        LEFT JOIN ledger_mem_summary m ON m.ledger_id = l.id
        LEFT JOIN ledger_inv_summary inv ON inv.ledger_id = l.id
        ORDER BY l.created_at ASC
    )
    SELECT jsonb_build_object(
        'ledgers', COALESCE(jsonb_agg(row_to_json(fl)), '[]'::jsonb),
        'totalCount', COUNT(*)::INT,
        'ghostCount', COUNT(*) FILTER (WHERE fl.is_ghost)::INT,
        'activeCount', COUNT(*) FILTER (WHERE fl.tx_count > 0)::INT
    ) INTO result
    FROM full_ledgers fl;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_all_cloud_ledgers_summary() TO anon, authenticated;

-- 10.3 管理員自雲端抹除指定帳本之 RPC 函式 (CASCADE 級聯刪除關聯成員與明細，嚴格限制建立者或 owner 管理員)
DROP FUNCTION IF EXISTS public.delete_cloud_ledger_admin(UUID);

CREATE OR REPLACE FUNCTION public.delete_cloud_ledger_admin(
    target_ledger_id UUID,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_is_authorized BOOLEAN := FALSE;
    v_ledger RECORD;
BEGIN
    IF target_ledger_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '帳本 ID 不得為空');
    END IF;

    SELECT * INTO v_ledger FROM public.ledgers WHERE id = target_ledger_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到指定的帳本');
    END IF;

    -- 權限檢查 1：已登入建立者、owner/admin 成員或 auth_session_links 授權鏈接
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := public.is_ledger_admin(target_ledger_id);
    END IF;

    -- 權限檢查 2：管理員安全 PIN 碼
    IF NOT v_is_authorized AND p_admin_pin IS NOT NULL AND v_ledger.admin_pin IS NOT NULL THEN
        IF trim(p_admin_pin) = trim(v_ledger.admin_pin) THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'message', '無權限刪除此帳本：只有帳本建立者或具備 owner 權限之管理員可執行此操作');
    END IF;

    DELETE FROM public.ledgers WHERE id = target_ledger_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_cloud_ledger_admin(UUID, TEXT) TO anon, authenticated;

-- 10.4 管理員一鍵批量清理 0 成員 0 交易之無用幽靈帳本之 RPC 函式
CREATE OR REPLACE FUNCTION public.batch_purge_ghost_ledgers_admin(ghost_ledger_ids UUID[])
RETURNS JSONB AS $$
DECLARE
    deleted_count INT := 0;
BEGIN
    IF ghost_ledger_ids IS NULL OR array_length(ghost_ledger_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'count', 0);
    END IF;

    DELETE FROM public.ledgers 
    WHERE id = ANY(ghost_ledger_ids);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'count', deleted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.batch_purge_ghost_ledgers_admin(UUID[]) TO anon, authenticated;

-- ==============================================================================
-- 12. 自訂常用付款方式表 (Payment Methods Definition)
-- 雲端定義共享：名稱、圖示、色彩、綁卡支援由帳本共享
-- 開關與排序：由各成員本機裝置獨立保存，兼顧全家共用與個人化偏好
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id TEXT NOT NULL,                           -- 付款方式代碼或 UUID (如 'custom_xxx' 或 UUID)
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                         -- 名稱 (例如 "Google Pay", "OPEN錢包")
    icon TEXT NOT NULL DEFAULT '📱',            -- 圖示 Emoji
    color TEXT NOT NULL DEFAULT '#0055B8',      -- 代表色
    type TEXT DEFAULT 'e_wallet',               -- 類型: 'cash' | 'credit_card' | 'e_wallet' | 'stored_value' | 'bank' | 'other'
    supports_credit_card BOOLEAN DEFAULT TRUE,  -- 是否支援綁定信用卡
    is_system BOOLEAN DEFAULT FALSE,            -- 是否為系統預設
    sort_order INT DEFAULT 1,                   -- 預設順序
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (ledger_id, id)
);

-- 啟用 RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- 政策：所屬帳本成員皆可讀取自訂付款方式
DROP POLICY IF EXISTS "成員可讀取所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可讀取所屬帳本的付款方式" ON public.payment_methods
    FOR SELECT USING (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可新增付款方式
DROP POLICY IF EXISTS "成員可新增所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可新增所屬帳本的付款方式" ON public.payment_methods
    FOR INSERT WITH CHECK (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可更新付款方式
DROP POLICY IF EXISTS "成員可更新所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可更新所屬帳本的付款方式" ON public.payment_methods
    FOR UPDATE USING (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可刪除付款方式
DROP POLICY IF EXISTS "成員可刪除所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可刪除所屬帳本的付款方式" ON public.payment_methods
    FOR DELETE USING (public.is_ledger_member(ledger_id));

-- 確保 Realtime 事件可用
ALTER TABLE public.payment_methods REPLICA IDENTITY FULL;

-- 補齊 payment_accounts 悠遊卡完整卡號支援 (card_number)、發卡機構識別 (issuer_bank) 與繳款截止日 (payment_due_day)
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS card_number TEXT;
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS issuer_bank TEXT;
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS payment_due_day INT;

-- ==============================================================================
-- 13. 家庭公帳月度總預算與成員個人額度表 (Ledger Budgets)
-- 包含家庭公帳總預算、警戒門檻、分類預算與成員個人專屬月額度 (JSONB)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    monthly_total NUMERIC(12, 2) DEFAULT 40000 NOT NULL,
    alert_threshold INT DEFAULT 80 NOT NULL,
    category_budgets JSONB DEFAULT '{}'::jsonb NOT NULL,
    member_budgets JSONB DEFAULT '{}'::jsonb NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT ledger_budgets_ledger_id_key UNIQUE (ledger_id)
);

-- 啟用 RLS
ALTER TABLE public.ledger_budgets ENABLE ROW LEVEL SECURITY;

-- 政策：所屬帳本成員皆可讀取預算設定
DROP POLICY IF EXISTS "成員可讀取所屬帳本的預算設定" ON public.ledger_budgets;
CREATE POLICY "成員可讀取所屬帳本的預算設定" ON public.ledger_budgets
    FOR SELECT USING (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可新增預算設定
DROP POLICY IF EXISTS "成員可新增所屬帳本的預算設定" ON public.ledger_budgets;
CREATE POLICY "成員可新增所屬帳本的預算設定" ON public.ledger_budgets
    FOR INSERT WITH CHECK (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可更新預算設定
DROP POLICY IF EXISTS "成員可更新所屬帳本的預算設定" ON public.ledger_budgets;
CREATE POLICY "成員可更新所屬帳本的預算設定" ON public.ledger_budgets
    FOR UPDATE USING (public.is_ledger_member(ledger_id));

-- 政策：所屬帳本成員皆可刪除預算設定
DROP POLICY IF EXISTS "成員可刪除所屬帳本的預算設定" ON public.ledger_budgets;
CREATE POLICY "成員可刪除所屬帳本的預算設定" ON public.ledger_budgets
    FOR DELETE USING (public.is_ledger_member(ledger_id));

-- 確保 Supabase Realtime 完整推播所有欄位
ALTER TABLE public.ledger_budgets REPLICA IDENTITY FULL;

-- 安全加入 Realtime 即時推播 (已存在則自動略過)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_budgets;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;



-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：資料庫安全預存程序 (SECURITY DEFINER RPCs)
-- 目的：取代前端的 service_role 超級管理員金鑰，將高權限穿透操作收斂至受控的資料庫內部
-- 日期：2026-10-30
-- ==============================================================================

-- 0. 確保資料庫必要欄位齊全 (防止因缺少欄位導致 RPC 執行失敗)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 1. 安全刪除交易明細 (含分帳、墓碑表記錄，徹底杜絕殭屍復活)
CREATE OR REPLACE FUNCTION public.secure_delete_transaction(
    p_tx_id UUID,
    p_ledger_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    -- 1.1 刪除分帳明細
    DELETE FROM public.transaction_splits WHERE transaction_id = p_tx_id;

    -- 1.2 寫入墓碑表以防舊裝置復活 (僅在 ledger 存在時記錄，防止外鍵違規)
    IF p_ledger_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ledgers WHERE id = p_ledger_id) THEN
        INSERT INTO public.deleted_transactions (id, ledger_id)
        VALUES (p_tx_id, p_ledger_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 1.3 刪除主交易記錄
    DELETE FROM public.transactions WHERE id = p_tx_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_deleted_count,
        'id', p_tx_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_delete_transaction(UUID, UUID) TO anon, authenticated;

-- 2. 安全更新交易明細 (純 PL/pgSQL 流程控制，徹底杜絕 CASE WHEN 語法混淆)
CREATE OR REPLACE FUNCTION public.secure_update_transaction(
    p_tx_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    -- 若交易不存在則直接返回
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_tx_id);
    END IF;

    -- 針對各欄位進行純淨個別更新
    IF p_payload ? 'amount' AND NULLIF(p_payload->>'amount', '') IS NOT NULL THEN
        UPDATE public.transactions SET amount = (p_payload->>'amount')::NUMERIC WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'type' AND NULLIF(p_payload->>'type', '') IS NOT NULL THEN
        UPDATE public.transactions SET "type" = (p_payload->>'type') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'category_id' THEN
        IF (p_payload->>'category_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.transactions SET category_id = (p_payload->>'category_id')::UUID WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET category_id = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'paid_by' THEN
        IF (p_payload->>'paid_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.transactions SET paid_by = (p_payload->>'paid_by')::UUID WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET paid_by = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'merchant' THEN
        UPDATE public.transactions SET merchant = NULLIF(p_payload->>'merchant', '') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'payment_method' AND NULLIF(p_payload->>'payment_method', '') IS NOT NULL THEN
        UPDATE public.transactions SET payment_method = (p_payload->>'payment_method') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'account_id' THEN
        IF (p_payload->>'account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.transactions SET account_id = (p_payload->>'account_id')::UUID WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET account_id = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'note' THEN
        UPDATE public.transactions SET note = (p_payload->>'note') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'image_url' THEN
        UPDATE public.transactions SET image_url = NULLIF(p_payload->>'image_url', '') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'is_settled' AND (p_payload->>'is_settled') IS NOT NULL THEN
        UPDATE public.transactions SET is_settled = (p_payload->>'is_settled')::BOOLEAN WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'is_reconciled' AND (p_payload->>'is_reconciled') IS NOT NULL THEN
        UPDATE public.transactions SET is_reconciled = (p_payload->>'is_reconciled')::BOOLEAN WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'completed_by' THEN
        IF (p_payload->>'completed_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.transactions SET completed_by = (p_payload->>'completed_by')::UUID WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET completed_by = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'completed_at' THEN
        IF NULLIF(p_payload->>'completed_at', '') IS NOT NULL AND (p_payload->>'completed_at') != 'null' THEN
            UPDATE public.transactions SET completed_at = (p_payload->>'completed_at')::TIMESTAMPTZ WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET completed_at = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'completion_note' THEN
        UPDATE public.transactions SET completion_note = (p_payload->>'completion_note') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'reminder_date' THEN
        UPDATE public.transactions SET reminder_date = NULLIF(p_payload->>'reminder_date', '') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'reminder_target' THEN
        UPDATE public.transactions SET reminder_target = NULLIF(p_payload->>'reminder_target', '') WHERE id = p_tx_id;
    END IF;

    IF p_payload ? 'linked_transaction_id' THEN
        IF (p_payload->>'linked_transaction_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.transactions SET linked_transaction_id = (p_payload->>'linked_transaction_id')::UUID WHERE id = p_tx_id;
        ELSE
            UPDATE public.transactions SET linked_transaction_id = NULL WHERE id = p_tx_id;
        END IF;
    END IF;

    IF p_payload ? 'transacted_at' AND NULLIF(p_payload->>'transacted_at', '') IS NOT NULL THEN
        UPDATE public.transactions SET transacted_at = (p_payload->>'transacted_at')::TIMESTAMPTZ WHERE id = p_tx_id;
    END IF;

    -- 最後統整更新 updated_at 並獲取受影響筆數
    UPDATE public.transactions SET updated_at = NOW() WHERE id = p_tx_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_updated_count,
        'id', p_tx_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_transaction(UUID, JSONB) TO anon, authenticated;

-- 3. 安全更新卡片帳戶餘額 (支援儲值卡、信用卡餘額即時校正)
CREATE OR REPLACE FUNCTION public.secure_update_account_balance(
    p_account_id UUID,
    p_balance NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    UPDATE public.payment_accounts
    SET balance = p_balance, updated_at = NOW()
    WHERE id = p_account_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_updated_count,
        'id', p_account_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_account_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_account_balance(UUID, NUMERIC) TO anon, authenticated;

-- 4. 安全批量新增交易 (例如全家零用錢批量發放、免登入連動待辦寫入)
CREATE OR REPLACE FUNCTION public.secure_batch_add_transactions(
    p_transactions JSONB
)
RETURNS JSONB AS $$
DECLARE
    item JSONB;
    v_inserted_count INT := 0;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_transactions)
    LOOP
        INSERT INTO public.transactions (
            id,
            ledger_id,
            creator_id,
            category_id,
            amount,
            type,
            paid_by,
            merchant,
            payment_method,
            account_id,
            note,
            image_url,
            is_settled,
            is_reconciled,
            completed_by,
            completed_at,
            completion_note,
            reminder_date,
            reminder_target,
            linked_transaction_id,
            transacted_at,
            created_at,
            updated_at
        ) VALUES (
            COALESCE((item->>'id')::UUID, uuid_generate_v4()),
            (item->>'ledger_id')::UUID,
            (item->>'creator_id')::UUID,
            CASE WHEN (item->>'category_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'category_id')::UUID ELSE NULL END,
            COALESCE((item->>'amount')::NUMERIC, 0),
            COALESCE(item->>'type', 'expense'),
            CASE WHEN (item->>'paid_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'paid_by')::UUID ELSE NULL END,
            NULLIF(item->>'merchant', ''),
            COALESCE(item->>'payment_method', 'cash'),
            CASE WHEN (item->>'account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'account_id')::UUID ELSE NULL END,
            item->>'note',
            NULLIF(item->>'image_url', ''),
            COALESCE((item->>'is_settled')::BOOLEAN, false),
            COALESCE((item->>'is_reconciled')::BOOLEAN, false),
            CASE WHEN (item->>'completed_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'completed_by')::UUID ELSE NULL END,
            CASE WHEN NULLIF(item->>'completed_at', '') IS NOT NULL AND (item->>'completed_at') != 'null' THEN (item->>'completed_at')::TIMESTAMPTZ ELSE NULL END,
            NULLIF(item->>'completion_note', ''),
            NULLIF(item->>'reminder_date', ''),
            COALESCE(NULLIF(item->>'reminder_target', ''), 'family'),
            CASE WHEN (item->>'linked_transaction_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'linked_transaction_id')::UUID ELSE NULL END,
            COALESCE((item->>'transacted_at')::TIMESTAMPTZ, NOW()),
            COALESCE((item->>'created_at')::TIMESTAMPTZ, NOW()),
            COALESCE((item->>'updated_at')::TIMESTAMPTZ, NOW())
        ) ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            merchant = COALESCE(EXCLUDED.merchant, transactions.merchant),
            payment_method = COALESCE(EXCLUDED.payment_method, transactions.payment_method),
            account_id = COALESCE(EXCLUDED.account_id, transactions.account_id),
            note = EXCLUDED.note,
            is_settled = EXCLUDED.is_settled,
            is_reconciled = EXCLUDED.is_reconciled,
            completed_by = COALESCE(EXCLUDED.completed_by, transactions.completed_by),
            completed_at = COALESCE(EXCLUDED.completed_at, transactions.completed_at),
            completion_note = COALESCE(EXCLUDED.completion_note, transactions.completion_note),
            reminder_date = COALESCE(EXCLUDED.reminder_date, transactions.reminder_date),
            reminder_target = COALESCE(EXCLUDED.reminder_target, transactions.reminder_target),
            linked_transaction_id = COALESCE(EXCLUDED.linked_transaction_id, transactions.linked_transaction_id),
            updated_at = NOW();

        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'inserted_count', v_inserted_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_batch_add_transactions(JSONB) TO anon, authenticated;

-- 5. 安全更新或刪除記帳分類
CREATE OR REPLACE FUNCTION public.secure_update_category(
    p_cat_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_cat_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_cat_id);
    END IF;

    IF p_payload ? 'name' AND NULLIF(p_payload->>'name', '') IS NOT NULL THEN
        UPDATE public.categories SET name = (p_payload->>'name') WHERE id = p_cat_id;
    END IF;

    IF p_payload ? 'icon' AND NULLIF(p_payload->>'icon', '') IS NOT NULL THEN
        UPDATE public.categories SET icon = (p_payload->>'icon') WHERE id = p_cat_id;
    END IF;

    IF p_payload ? 'color' AND NULLIF(p_payload->>'color', '') IS NOT NULL THEN
        UPDATE public.categories SET color = (p_payload->>'color') WHERE id = p_cat_id;
    END IF;

    IF p_payload ? 'sort_order' AND NULLIF(p_payload->>'sort_order', '') IS NOT NULL THEN
        UPDATE public.categories SET sort_order = (p_payload->>'sort_order')::INT WHERE id = p_cat_id;
    END IF;

    IF p_payload ? 'type' AND NULLIF(p_payload->>'type', '') IS NOT NULL THEN
        UPDATE public.categories SET "type" = (p_payload->>'type') WHERE id = p_cat_id;
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_updated_count,
        'id', p_cat_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_cat_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_category(UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.secure_delete_category(
    p_cat_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM public.categories WHERE id = p_cat_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_deleted_count,
        'id', p_cat_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_cat_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_delete_category(UUID) TO anon, authenticated;

-- 6. 安全更新與刪除週期扣款規則 (相容 default_amount, due_day, amount_type 等欄位)
CREATE OR REPLACE FUNCTION public.secure_update_recurring_rule(
    p_rule_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.recurring_rules WHERE id = p_rule_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_rule_id);
    END IF;

    IF p_payload ? 'name' AND NULLIF(p_payload->>'name', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET name = (p_payload->>'name') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'default_amount' AND NULLIF(p_payload->>'default_amount', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET default_amount = (p_payload->>'default_amount')::NUMERIC WHERE id = p_rule_id;
    ELSIF p_payload ? 'amount' AND NULLIF(p_payload->>'amount', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET default_amount = (p_payload->>'amount')::NUMERIC WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'amount_type' AND NULLIF(p_payload->>'amount_type', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET amount_type = (p_payload->>'amount_type') WHERE id = p_rule_id;
    ELSIF p_payload ? 'type' AND NULLIF(p_payload->>'type', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET amount_type = (p_payload->>'type') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'category_id' THEN
        IF (p_payload->>'category_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.recurring_rules SET category_id = (p_payload->>'category_id')::UUID WHERE id = p_rule_id;
        ELSE
            UPDATE public.recurring_rules SET category_id = NULL WHERE id = p_rule_id;
        END IF;
    END IF;

    IF p_payload ? 'paid_by' THEN
        IF (p_payload->>'paid_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.recurring_rules SET paid_by = (p_payload->>'paid_by')::UUID WHERE id = p_rule_id;
        ELSE
            UPDATE public.recurring_rules SET paid_by = NULL WHERE id = p_rule_id;
        END IF;
    END IF;

    IF p_payload ? 'account_id' THEN
        IF (p_payload->>'account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.recurring_rules SET account_id = (p_payload->>'account_id')::UUID WHERE id = p_rule_id;
        ELSE
            UPDATE public.recurring_rules SET account_id = NULL WHERE id = p_rule_id;
        END IF;
    END IF;

    IF p_payload ? 'merchant' THEN
        UPDATE public.recurring_rules SET merchant = NULLIF(p_payload->>'merchant', '') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'payment_method' AND NULLIF(p_payload->>'payment_method', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET payment_method = (p_payload->>'payment_method') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'frequency' AND NULLIF(p_payload->>'frequency', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET frequency = (p_payload->>'frequency') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'due_day' AND NULLIF(p_payload->>'due_day', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET due_day = (p_payload->>'due_day')::INT WHERE id = p_rule_id;
    ELSIF p_payload ? 'day_of_month' AND NULLIF(p_payload->>'day_of_month', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET due_day = (p_payload->>'day_of_month')::INT WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'bimonthly_start_month' AND NULLIF(p_payload->>'bimonthly_start_month', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET bimonthly_start_month = (p_payload->>'bimonthly_start_month')::INT WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'is_active' AND (p_payload->>'is_active') IS NOT NULL THEN
        UPDATE public.recurring_rules SET is_active = (p_payload->>'is_active')::BOOLEAN WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'last_recorded_period' THEN
        UPDATE public.recurring_rules SET last_recorded_period = (p_payload->>'last_recorded_period') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'is_installment' AND (p_payload->>'is_installment') IS NOT NULL THEN
        UPDATE public.recurring_rules SET is_installment = (p_payload->>'is_installment')::BOOLEAN WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'total_installments' AND NULLIF(p_payload->>'total_installments', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET total_installments = (p_payload->>'total_installments')::INT WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'current_installment' AND NULLIF(p_payload->>'current_installment', '') IS NOT NULL THEN
        UPDATE public.recurring_rules SET current_installment = (p_payload->>'current_installment')::INT WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'installment_start_period' THEN
        UPDATE public.recurring_rules SET installment_start_period = (p_payload->>'installment_start_period') WHERE id = p_rule_id;
    END IF;

    IF p_payload ? 'note' THEN
        UPDATE public.recurring_rules SET note = (p_payload->>'note') WHERE id = p_rule_id;
    END IF;

    UPDATE public.recurring_rules SET updated_at = NOW() WHERE id = p_rule_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_updated_count,
        'id', p_rule_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_rule_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_recurring_rule(UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.secure_delete_recurring_rule(
    p_rule_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM public.recurring_rules WHERE id = p_rule_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_deleted_count,
        'id', p_rule_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_rule_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_delete_recurring_rule(UUID) TO anon, authenticated;

-- 7. 安全解除成員 Google 綁定與清空認領碼
CREATE OR REPLACE FUNCTION public.secure_unlink_profile(
    p_profile_id UUID
)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.profiles
    SET
        auth_email = NULL,
        auth_provider = NULL,
        is_locked = FALSE,
        claim_code = NULL,
        claim_code_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_profile_id;

    RETURN jsonb_build_object('success', true, 'id', p_profile_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_unlink_profile(UUID) TO anon, authenticated;

-- 8. 安全新增付款卡片
CREATE OR REPLACE FUNCTION public.secure_add_payment_account(
    p_account JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_id UUID;
BEGIN
    v_id := COALESCE(NULLIF(p_account->>'id', '')::UUID, uuid_generate_v4());
    
    INSERT INTO public.payment_accounts (
        id,
        ledger_id,
        name,
        type,
        user_id,
        last_four_digits,
        card_number,
        issuer_bank,
        billing_cycle_date,
        payment_due_day,
        balance,
        color,
        icon,
        sort_order,
        created_at,
        updated_at
    ) VALUES (
        v_id,
        (p_account->>'ledger_id')::UUID,
        COALESCE(p_account->>'name', '新卡片'),
        COALESCE(p_account->>'type', 'credit_card'),
        CASE WHEN (p_account->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_account->>'user_id')::UUID ELSE NULL END,
        NULLIF(p_account->>'last_four_digits', ''),
        NULLIF(p_account->>'card_number', ''),
        NULLIF(trim(p_account->>'issuer_bank'), ''),
        NULLIF(p_account->>'billing_cycle_date', '')::INT,
        NULLIF(p_account->>'payment_due_day', '')::INT,
        COALESCE(NULLIF(p_account->>'balance', '')::NUMERIC, 0),
        COALESCE(p_account->>'color', '#3B82F6'),
        COALESCE(p_account->>'icon', '💳'),
        COALESCE(NULLIF(p_account->>'sort_order', '')::INT, 0),
        COALESCE(NULLIF(p_account->>'created_at', '')::TIMESTAMPTZ, NOW()),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        user_id = EXCLUDED.user_id,
        last_four_digits = EXCLUDED.last_four_digits,
        card_number = EXCLUDED.card_number,
        issuer_bank = EXCLUDED.issuer_bank,
        billing_cycle_date = EXCLUDED.billing_cycle_date,
        payment_due_day = EXCLUDED.payment_due_day,
        balance = EXCLUDED.balance,
        color = EXCLUDED.color,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    WHERE payment_accounts.ledger_id = EXCLUDED.ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_id,
        'issuer_bank_supported', true,
        'payment_due_day_supported', true
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_add_payment_account(JSONB) TO anon, authenticated;

-- 9. 安全更新付款卡片
CREATE OR REPLACE FUNCTION public.secure_update_payment_account(
    p_account_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = p_account_id) THEN
        RETURN jsonb_build_object(
            'success', true,
            'rows_affected', 0,
            'id', p_account_id,
            'issuer_bank_supported', true,
            'payment_due_day_supported', true
        );
    END IF;

    IF p_payload ? 'name' AND NULLIF(p_payload->>'name', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET name = (p_payload->>'name') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'type' AND NULLIF(p_payload->>'type', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET "type" = (p_payload->>'type') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'user_id' THEN
        IF (p_payload->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.payment_accounts SET user_id = (p_payload->>'user_id')::UUID WHERE id = p_account_id;
        ELSE
            UPDATE public.payment_accounts SET user_id = NULL WHERE id = p_account_id;
        END IF;
    END IF;

    IF p_payload ? 'last_four_digits' THEN
        UPDATE public.payment_accounts SET last_four_digits = NULLIF(p_payload->>'last_four_digits', '') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'card_number' THEN
        UPDATE public.payment_accounts SET card_number = NULLIF(p_payload->>'card_number', '') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'issuer_bank' THEN
        UPDATE public.payment_accounts SET issuer_bank = NULLIF(trim(p_payload->>'issuer_bank'), '') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'billing_cycle_date' THEN
        IF NULLIF(p_payload->>'billing_cycle_date', '') IS NOT NULL THEN
            UPDATE public.payment_accounts SET billing_cycle_date = (p_payload->>'billing_cycle_date')::INT WHERE id = p_account_id;
        ELSE
            UPDATE public.payment_accounts SET billing_cycle_date = NULL WHERE id = p_account_id;
        END IF;
    END IF;

    IF p_payload ? 'payment_due_day' THEN
        IF NULLIF(p_payload->>'payment_due_day', '') IS NOT NULL THEN
            UPDATE public.payment_accounts SET payment_due_day = (p_payload->>'payment_due_day')::INT WHERE id = p_account_id;
        ELSE
            UPDATE public.payment_accounts SET payment_due_day = NULL WHERE id = p_account_id;
        END IF;
    END IF;

    IF p_payload ? 'balance' AND NULLIF(p_payload->>'balance', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET balance = (p_payload->>'balance')::NUMERIC WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'color' AND NULLIF(p_payload->>'color', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET color = (p_payload->>'color') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'icon' AND NULLIF(p_payload->>'icon', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET icon = (p_payload->>'icon') WHERE id = p_account_id;
    END IF;

    IF p_payload ? 'sort_order' AND NULLIF(p_payload->>'sort_order', '') IS NOT NULL THEN
        UPDATE public.payment_accounts SET sort_order = (p_payload->>'sort_order')::INT WHERE id = p_account_id;
    END IF;

    UPDATE public.payment_accounts SET updated_at = NOW() WHERE id = p_account_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_updated_count,
        'id', p_account_id,
        'issuer_bank_supported', true,
        'payment_due_day_supported', true
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_account_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_payment_account(UUID, JSONB) TO anon, authenticated;

-- 10. 安全刪除付款卡片
CREATE OR REPLACE FUNCTION public.secure_delete_payment_account(
    p_account_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM public.payment_accounts WHERE id = p_account_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'rows_affected', v_deleted_count,
        'id', p_account_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'id', p_account_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_delete_payment_account(UUID) TO anon, authenticated;

-- 11. 安全新增記帳分類
CREATE OR REPLACE FUNCTION public.secure_add_category(
    p_category JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_id UUID;
BEGIN
    v_id := COALESCE(NULLIF(p_category->>'id', '')::UUID, uuid_generate_v4());

    INSERT INTO public.categories (
        id,
        ledger_id,
        name,
        icon,
        color,
        sort_order,
        type,
        created_at,
        updated_at
    ) VALUES (
        v_id,
        (p_category->>'ledger_id')::UUID,
        COALESCE(p_category->>'name', '新分類'),
        COALESCE(p_category->>'icon', '🏷️'),
        COALESCE(p_category->>'color', '#6B7280'),
        COALESCE(NULLIF(p_category->>'sort_order', '')::INT, 0),
        COALESCE(p_category->>'type', 'expense'),
        COALESCE(NULLIF(p_category->>'created_at', '')::TIMESTAMPTZ, NOW()),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        color = EXCLUDED.color,
        sort_order = EXCLUDED.sort_order,
        type = EXCLUDED.type,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_add_category(JSONB) TO anon, authenticated;

-- 12. 安全更新管理員 PIN 碼
CREATE OR REPLACE FUNCTION public.secure_set_admin_pin(
    p_ledger_id UUID,
    p_admin_pin TEXT
)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.ledgers 
    SET admin_pin = NULLIF(p_admin_pin, ''), updated_at = NOW()
    WHERE id = p_ledger_id;

    RETURN jsonb_build_object('success', true, 'ledger_id', p_ledger_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_set_admin_pin(UUID, TEXT) TO anon, authenticated;

-- 13. 安全更新帳本設定 (名稱、唯讀鎖、門禁安全鎖、貨幣、描述)
CREATE OR REPLACE FUNCTION public.secure_update_ledger(
    p_ledger_id UUID,
    p_payload JSONB,
    p_operator_id UUID DEFAULT NULL,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.ledgers WHERE id = p_ledger_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ledger_not_found', 'message', '找不到指定的帳本');
    END IF;

    -- 軌道 1：透過 Auth Session 或 auth_session_links 授權鏈接
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := public.is_ledger_admin(p_ledger_id);
    END IF;

    -- 軌道 2：透過本地活動成員 ID (免登入成員，名冊中登記為 owner/admin 或帳本建立者)
    IF NOT v_is_authorized AND p_operator_id IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_id = p_ledger_id AND user_id = p_operator_id AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = p_operator_id
        );
    END IF;

    -- 軌道 3：透過管理員 PIN 碼驗證
    IF NOT v_is_authorized AND p_admin_pin IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND (admin_pin = p_admin_pin OR admin_pin IS NULL)
        );
    END IF;

    -- 容錯保底：若此帳本全體成員無任何管理員且無 created_by，允許設定
    IF NOT v_is_authorized THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.ledger_members WHERE ledger_id = p_ledger_id AND role IN ('owner', 'admin')
        ) AND (SELECT created_by FROM public.ledgers WHERE id = p_ledger_id) IS NULL THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能修改帳本設定');
    END IF;

    IF p_payload ? 'name' AND NULLIF(p_payload->>'name', '') IS NOT NULL THEN
        UPDATE public.ledgers SET name = TRIM(p_payload->>'name') WHERE id = p_ledger_id;
    END IF;

    IF p_payload ? 'allow_new_members' AND (p_payload->>'allow_new_members') IS NOT NULL THEN
        UPDATE public.ledgers SET allow_new_members = (p_payload->>'allow_new_members')::BOOLEAN WHERE id = p_ledger_id;
    END IF;

    IF p_payload ? 'is_read_only' AND (p_payload->>'is_read_only') IS NOT NULL THEN
        UPDATE public.ledgers SET is_read_only = (p_payload->>'is_read_only')::BOOLEAN WHERE id = p_ledger_id;
    END IF;

    IF p_payload ? 'description' THEN
        UPDATE public.ledgers SET description = (p_payload->>'description') WHERE id = p_ledger_id;
    END IF;

    IF p_payload ? 'currency' AND NULLIF(p_payload->>'currency', '') IS NOT NULL THEN
        UPDATE public.ledgers SET currency = (p_payload->>'currency') WHERE id = p_ledger_id;
    END IF;

    UPDATE public.ledgers SET updated_at = NOW() WHERE id = p_ledger_id;

    RETURN jsonb_build_object('success', true, 'ledger_id', p_ledger_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_update_ledger(UUID, JSONB, UUID, TEXT) TO anon, authenticated, service_role;

-- 14. 安全重設或自訂邀請碼
CREATE OR REPLACE FUNCTION public.secure_set_invite_code(
    p_ledger_id UUID,
    p_invite_code TEXT,
    p_operator_id UUID DEFAULT NULL,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_clean_code TEXT;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_clean_code := UPPER(TRIM(p_invite_code));
    IF LENGTH(v_clean_code) < 3 OR LENGTH(v_clean_code) > 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code_length', 'message', '邀請碼長度需在 3 至 15 個字元之間');
    END IF;

    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := public.is_ledger_admin(p_ledger_id);
    END IF;

    IF NOT v_is_authorized AND p_operator_id IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_id = p_ledger_id AND user_id = p_operator_id AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = p_operator_id
        );
    END IF;

    IF NOT v_is_authorized AND p_admin_pin IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND (admin_pin = p_admin_pin OR admin_pin IS NULL)
        );
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能變更邀請碼');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.ledger_invites
        WHERE UPPER(TRIM(invite_code)) = v_clean_code AND ledger_id != p_ledger_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'code_taken', 'message', '此自訂邀請碼已被其他家庭使用，請換一個！');
    END IF;

    DELETE FROM public.ledger_invites WHERE ledger_id = p_ledger_id;

    INSERT INTO public.ledger_invites (
        ledger_id,
        invite_code,
        created_by,
        expires_at,
        created_at
    ) VALUES (
        p_ledger_id,
        v_clean_code,
        COALESCE(auth.uid(), p_operator_id),
        NOW() + INTERVAL '1 year',
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'invite_code', v_clean_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_set_invite_code(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- 15. 安全移除成員與關聯資產安全移轉
CREATE OR REPLACE FUNCTION public.secure_remove_member(
    p_ledger_id UUID,
    p_user_id UUID,
    p_transfer_to_id UUID DEFAULT NULL,
    p_operator_id UUID DEFAULT NULL,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_is_authorized BOOLEAN := FALSE;
    v_ledger_creator UUID;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := public.is_ledger_admin(p_ledger_id);
    END IF;

    IF NOT v_is_authorized AND p_operator_id IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_id = p_ledger_id AND user_id = p_operator_id AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = p_operator_id
        );
    END IF;

    IF NOT v_is_authorized AND p_admin_pin IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND (admin_pin = p_admin_pin OR admin_pin IS NULL)
        );
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能移除家庭成員');
    END IF;

    SELECT created_by INTO v_ledger_creator FROM public.ledgers WHERE id = p_ledger_id;
    IF v_ledger_creator IS NOT NULL AND p_user_id = v_ledger_creator THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_remove_creator', 'message', '無法移除帳本原始建立者');
    END IF;

    IF p_transfer_to_id IS NOT NULL AND p_transfer_to_id <> p_user_id THEN
        UPDATE public.transactions
        SET creator_id = p_transfer_to_id
        WHERE ledger_id = p_ledger_id AND creator_id = p_user_id;

        UPDATE public.transactions
        SET paid_by = p_transfer_to_id
        WHERE ledger_id = p_ledger_id AND paid_by = p_user_id;

        UPDATE public.payment_accounts
        SET user_id = p_transfer_to_id
        WHERE ledger_id = p_ledger_id AND user_id = p_user_id;

        UPDATE public.recurring_rules
        SET paid_by = p_transfer_to_id
        WHERE ledger_id = p_ledger_id AND paid_by = p_user_id;

        IF to_regclass('public.transaction_splits') IS NOT NULL THEN
            UPDATE public.transaction_splits ts_keep
            SET split_amount = COALESCE(ts_keep.split_amount, 0) + COALESCE(ts_dup.split_amount, 0)
            FROM public.transaction_splits ts_dup
            JOIN public.transactions t ON t.id = ts_dup.transaction_id
            WHERE t.ledger_id = p_ledger_id
              AND ts_dup.user_id = p_user_id
              AND ts_keep.transaction_id = ts_dup.transaction_id
              AND ts_keep.user_id = p_transfer_to_id;

            DELETE FROM public.transaction_splits ts_dup
            USING public.transactions t
            WHERE ts_dup.transaction_id = t.id
              AND t.ledger_id = p_ledger_id
              AND ts_dup.user_id = p_user_id
              AND EXISTS (
                  SELECT 1 FROM public.transaction_splits ts_keep
                  WHERE ts_keep.transaction_id = ts_dup.transaction_id
                    AND ts_keep.user_id = p_transfer_to_id
              );

            UPDATE public.transaction_splits ts
            SET user_id = p_transfer_to_id
            FROM public.transactions t
            WHERE ts.transaction_id = t.id
              AND t.ledger_id = p_ledger_id
              AND ts.user_id = p_user_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ledger_budgets'
              AND column_name = 'member_budgets'
        ) THEN
            EXECUTE '
                UPDATE public.ledger_budgets
                SET member_budgets = CASE
                    WHEN NOT (member_budgets ? $1::text) THEN
                        (member_budgets - $2::text) || jsonb_build_object($1::text, member_budgets -> $2::text)
                    ELSE
                        member_budgets - $2::text
                END
                WHERE ledger_id = $3
                  AND member_budgets IS NOT NULL
                  AND member_budgets ? $2::text'
            USING p_transfer_to_id, p_user_id, p_ledger_id;
        END IF;

        IF to_regclass('public.carrier_rules') IS NOT NULL THEN
            EXECUTE 'UPDATE public.carrier_rules SET user_id = $1 WHERE ledger_id = $2 AND user_id = $3'
            USING p_transfer_to_id, p_ledger_id, p_user_id;
        END IF;
    END IF;

    DELETE FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_user_id;
    DELETE FROM public.member_devices WHERE ledger_id = p_ledger_id AND member_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_remove_member(UUID, UUID, UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- 16. 連結當前連線至已認證信箱之通行證 RPC (防分身專用)
CREATE OR REPLACE FUNCTION public.link_session_to_email(
    p_email TEXT,
    p_session_uid UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_clean_email TEXT;
    v_uid UUID;
BEGIN
    v_clean_email := lower(trim(coalesce(p_email, '')));
    v_uid := COALESCE(p_session_uid, auth.uid());

    IF v_clean_email = ''
       OR position('@' in v_clean_email) = 0
       OR right(v_clean_email, 13) = '@family.local'
       OR v_clean_email LIKE '%anonymous%'
    THEN
        RETURN jsonb_build_object('success', false, 'message', '未提供有效的認證信箱');
    END IF;

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '未提供有效的連線 Session ID');
    END IF;

    -- 驗證該信箱確實為已受保護的真實成員身分，避免任意未授權信箱鏈接
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_email IS NOT NULL
          AND lower(trim(auth_email)) = v_clean_email
          AND is_locked = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到受保護的對應 Google 身分');
    END IF;

    INSERT INTO public.auth_session_links (session_uid, auth_email, linked_at)
    VALUES (v_uid, v_clean_email, NOW())
    ON CONFLICT (session_uid) DO UPDATE
    SET auth_email = EXCLUDED.auth_email,
        linked_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'session_uid', v_uid,
        'email', v_clean_email
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.link_session_to_email(TEXT, UUID) TO anon, authenticated, service_role;

-- 17. 取得使用者已授權之家庭公帳清單 (支援獨立通行證與停止虛擬成員寫入名冊)
CREATE OR REPLACE FUNCTION public.get_user_authorized_ledgers(
    p_email TEXT DEFAULT NULL,
    p_link_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_clean_email TEXT;
    v_ledgers JSONB;
BEGIN
    -- 1. 解析目標 Email（p_email -> auth_session_links -> profiles -> auth.jwt）
    v_clean_email := lower(trim(coalesce(p_email, '')));

    IF v_clean_email = '' AND auth.uid() IS NOT NULL THEN
        SELECT lower(trim(auth_email)) INTO v_clean_email
        FROM public.auth_session_links
        WHERE session_uid = auth.uid()
        LIMIT 1;
    END IF;

    IF v_clean_email = '' AND auth.uid() IS NOT NULL THEN
        SELECT lower(trim(auth_email)) INTO v_clean_email
        FROM public.profiles
        WHERE id = auth.uid() AND auth_email IS NOT NULL
        LIMIT 1;
    END IF;

    IF v_clean_email = '' THEN
        v_clean_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    END IF;

    IF v_clean_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '未提供有效的認證信箱');
    END IF;

    -- 2. 安全驗證：確認此 Email 在 profiles 中確實存在 (防止惡意列舉他人帳本)
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_email IS NOT NULL AND lower(trim(auth_email)) = v_clean_email
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', '此信箱尚未關聯任何家庭公帳');
    END IF;

    -- 3. 僅寫入獨立通行證表 auth_session_links，絕不把裝置 UID 插入家庭成員名冊 ledger_members
    IF p_link_user_id IS NOT NULL
       AND position('@' in v_clean_email) > 0
       AND right(v_clean_email, 13) <> '@family.local'
       AND v_clean_email NOT LIKE '%anonymous%'
    THEN
        INSERT INTO public.auth_session_links (session_uid, auth_email, linked_at)
        VALUES (p_link_user_id, v_clean_email, NOW())
        ON CONFLICT (session_uid) DO UPDATE
        SET auth_email = EXCLUDED.auth_email,
            linked_at = NOW();
    END IF;

    -- 4. 取得該 Email 關聯的所有家庭公帳完整清單
    SELECT jsonb_agg(sub) INTO v_ledgers
    FROM (
        SELECT DISTINCT ON (l.id)
            l.id,
            l.name,
            l.description,
            l.currency,
            l.created_at,
            l.updated_at,
            l.admin_pin,
            l.is_read_only,
            l.allow_new_members,
            l.created_by,
            COALESCE(lm.role, CASE WHEN l.created_by = p.id THEN 'owner' ELSE 'member' END) AS "userRole",
            COALESCE(NULLIF(trim(lm.custom_name), ''), p.display_name, '家庭成員') AS "userDisplayName",
            COALESCE(NULLIF(trim(lm.custom_avatar), ''), p.avatar_url, '👤') AS "userAvatar"
        FROM public.ledgers l
        LEFT JOIN public.ledger_members lm ON l.id = lm.ledger_id
        LEFT JOIN public.profiles p ON (lm.user_id = p.id OR l.created_by = p.id)
        WHERE (p.auth_email IS NOT NULL AND lower(trim(p.auth_email)) = v_clean_email)
           OR l.id = 'ee100000-0000-4000-8000-000000000001'::uuid
        ORDER BY
            l.id,
            COALESCE(l.created_by = p.id, FALSE) DESC,
            COALESCE(lm.role = 'owner', FALSE) DESC,
            COALESCE(p.is_locked, FALSE) DESC,
            (coalesce(lm.custom_avatar, p.avatar_url, '') NOT LIKE 'http%') DESC,
            l.created_at DESC NULLS LAST
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'email', v_clean_email,
        'count', jsonb_array_length(COALESCE(v_ledgers, '[]'::jsonb)),
        'ledgers', COALESCE(v_ledgers, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_authorized_ledgers(TEXT, UUID) TO anon, authenticated, service_role;

-- 18. LINE 個人自主訂閱與家庭群組雙軌日報資料表及安全 RPC (20261123)
CREATE TABLE IF NOT EXISTS public.line_user_bindings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL UNIQUE,
    line_display_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    skip_quiet_day BOOLEAN NOT NULL DEFAULT FALSE,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.line_ledger_subscriptions (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    include_summary BOOLEAN NOT NULL DEFAULT TRUE,
    include_credit_cards BOOLEAN NOT NULL DEFAULT TRUE,
    include_memos BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_line_ledger_subs_ledger
    ON public.line_ledger_subscriptions(ledger_id);

CREATE TABLE IF NOT EXISTS public.line_group_bindings (
    ledger_id UUID PRIMARY KEY REFERENCES public.ledgers(id) ON DELETE CASCADE,
    line_group_id TEXT NOT NULL,
    group_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    skip_quiet_day BOOLEAN NOT NULL DEFAULT FALSE,
    include_credit_cards BOOLEAN NOT NULL DEFAULT FALSE,
    bound_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_group_bindings_group_id
    ON public.line_group_bindings(line_group_id);

CREATE TABLE IF NOT EXISTS public.line_bind_tokens (
    code TEXT PRIMARY KEY,
    target_type TEXT NOT NULL CHECK (target_type IN ('user', 'group')),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ledger_id UUID REFERENCES public.ledgers(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_bind_tokens_expires
    ON public.line_bind_tokens(expires_at);

ALTER TABLE public.line_user_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_ledger_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_group_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_bind_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.resolve_same_member_ids(p_user_id UUID)
RETURNS UUID[] AS $$
DECLARE
    v_auth_email TEXT;
    v_ids UUID[];
BEGIN
    IF p_user_id IS NULL THEN
        RETURN ARRAY[]::UUID[];
    END IF;

    SELECT lower(trim(auth_email)) INTO v_auth_email
    FROM public.profiles
    WHERE id = p_user_id
    LIMIT 1;

    IF v_auth_email IS NOT NULL
       AND v_auth_email <> ''
       AND position('@' in v_auth_email) > 0
       AND right(v_auth_email, 13) <> '@family.local'
       AND v_auth_email NOT LIKE '%anonymous%'
    THEN
        SELECT COALESCE(array_agg(DISTINCT id), ARRAY[p_user_id]::UUID[])
        INTO v_ids
        FROM public.profiles
        WHERE id = p_user_id
           OR (auth_email IS NOT NULL AND lower(trim(auth_email)) = v_auth_email);
    ELSE
        v_ids := ARRAY[p_user_id]::UUID[];
    END IF;

    RETURN COALESCE(v_ids, ARRAY[p_user_id]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.resolve_same_member_ids(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_same_member_ids(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_line_group(
    p_ledger_id UUID,
    p_operator_id UUID,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_authorized BOOLEAN := FALSE;
    v_operator_ids UUID[];
BEGIN
    IF p_ledger_id IS NULL OR p_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN
        RETURN FALSE;
    END IF;

    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := public.is_ledger_admin(p_ledger_id);
    END IF;

    IF NOT v_is_authorized AND p_operator_id IS NOT NULL THEN
        v_operator_ids := public.resolve_same_member_ids(p_operator_id);
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_id = p_ledger_id AND user_id = ANY(v_operator_ids) AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE id = p_ledger_id AND created_by = ANY(v_operator_ids)
        );
    END IF;

    IF NOT v_is_authorized AND NULLIF(trim(coalesce(p_admin_pin, '')), '') IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE id = p_ledger_id AND (admin_pin = p_admin_pin OR admin_pin IS NULL)
        );
    END IF;

    IF NOT v_is_authorized THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.ledger_members WHERE ledger_id = p_ledger_id AND role IN ('owner', 'admin')
        ) AND (SELECT created_by FROM public.ledgers WHERE id = p_ledger_id) IS NULL THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    RETURN v_is_authorized;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.can_manage_line_group(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_line_group(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_line_bind_code(
    p_user_id UUID,
    p_target_type TEXT DEFAULT 'user',
    p_ledger_id UUID DEFAULT NULL,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_target_type TEXT := lower(trim(coalesce(p_target_type, 'user')));
    v_prefix TEXT;
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_code TEXT;
    v_suffix TEXT;
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '10 minutes';
    v_i INT;
    v_attempt INT := 0;
BEGIN
    IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found', 'message', '找不到對應的家庭成員資料');
    END IF;

    IF v_target_type NOT IN ('user', 'group') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_target_type', 'message', '不支援的綁定類型');
    END IF;

    IF v_target_type = 'group' THEN
        IF p_ledger_id IS NULL OR p_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN
            RETURN jsonb_build_object('success', false, 'error', 'demo_ledger_not_allowed', 'message', '示範帳本不支援綁定家庭 LINE 群組');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.ledgers WHERE id = p_ledger_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'ledger_not_found', 'message', '找不到指定的家庭帳本');
        END IF;

        IF NOT public.can_manage_line_group(p_ledger_id, p_user_id, p_admin_pin) THEN
            RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能產生家庭 LINE 群組綁定碼');
        END IF;
    END IF;

    DELETE FROM public.line_bind_tokens
    WHERE expires_at < NOW()
       OR (
           user_id = p_user_id
           AND target_type = v_target_type
           AND (v_target_type = 'user' OR ledger_id IS NOT DISTINCT FROM p_ledger_id)
       );

    v_prefix := CASE WHEN v_target_type = 'group' THEN 'GRP-' ELSE 'BIND-' END;

    LOOP
        v_attempt := v_attempt + 1;
        v_suffix := '';
        FOR v_i IN 1..6 LOOP
            v_suffix := v_suffix || substr(v_chars, 1 + floor(random() * length(v_chars))::INT, 1);
        END LOOP;
        v_code := v_prefix || v_suffix;

        IF NOT EXISTS (SELECT 1 FROM public.line_bind_tokens WHERE code = v_code) THEN
            EXIT;
        END IF;

        IF v_attempt >= 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'code_generation_failed', 'message', '產生綁定碼失敗，請稍後再試');
        END IF;
    END LOOP;

    INSERT INTO public.line_bind_tokens (code, target_type, user_id, ledger_id, expires_at)
    VALUES (
        v_code,
        v_target_type,
        p_user_id,
        CASE WHEN p_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN NULL ELSE p_ledger_id END,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code,
        'target_type', v_target_type,
        'expires_at', v_expires_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.generate_line_bind_code(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_line_notification_settings(
    p_user_id UUID,
    p_ledger_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_ids UUID[];
    v_binding RECORD;
    v_effective_binding_uid UUID;
    v_user_binding JSONB;
    v_ledger_subs JSONB;
    v_group RECORD;
    v_group_binding JSONB;
BEGIN
    IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found', 'message', '找不到對應的成員資料');
    END IF;

    v_user_ids := public.resolve_same_member_ids(p_user_id);

    SELECT user_id, line_display_name, enabled, skip_quiet_day, bound_at
    INTO v_binding
    FROM public.line_user_bindings
    WHERE user_id = ANY(v_user_ids)
    ORDER BY (user_id = p_user_id) DESC, updated_at DESC
    LIMIT 1;

    IF v_binding.user_id IS NOT NULL THEN
        v_effective_binding_uid := v_binding.user_id;
        v_user_binding := jsonb_build_object(
            'is_bound', true,
            'line_display_name', v_binding.line_display_name,
            'enabled', v_binding.enabled,
            'skip_quiet_day', v_binding.skip_quiet_day,
            'bound_at', v_binding.bound_at
        );
    ELSE
        v_effective_binding_uid := p_user_id;
        v_user_binding := jsonb_build_object(
            'is_bound', false,
            'line_display_name', null,
            'enabled', false,
            'skip_quiet_day', false,
            'bound_at', null
        );
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_ledger_subs
    FROM (
        SELECT
            l.id AS "ledgerId",
            l.name AS "ledgerName",
            COALESCE(
                (
                    SELECT lm.role FROM public.ledger_members lm
                    WHERE lm.ledger_id = l.id AND lm.user_id = ANY(v_user_ids)
                    ORDER BY (lm.role = 'owner') DESC, (lm.role = 'admin') DESC
                    LIMIT 1
                ),
                CASE WHEN l.created_by = ANY(v_user_ids) THEN 'owner' ELSE 'member' END
            ) AS "role",
            COALESCE(s.enabled, false) AS "enabled",
            COALESCE(s.include_summary, true) AS "includeSummary",
            COALESCE(s.include_credit_cards, true) AS "includeCreditCards",
            COALESCE(s.include_memos, true) AS "includeMemos"
        FROM public.ledgers l
        LEFT JOIN public.line_ledger_subscriptions s
            ON s.ledger_id = l.id AND s.user_id = v_effective_binding_uid
        WHERE l.id <> 'ee100000-0000-4000-8000-000000000001'::uuid
          AND lower(l.name) NOT LIKE '%sweethome%'
          AND (
              l.created_by = ANY(v_user_ids)
              OR EXISTS (
                  SELECT 1 FROM public.ledger_members lm
                  WHERE lm.ledger_id = l.id AND lm.user_id = ANY(v_user_ids)
              )
          )
        ORDER BY l.created_at ASC
    ) sub;

    IF p_ledger_id IS NOT NULL AND p_ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid THEN
        SELECT ledger_id, group_name, enabled, skip_quiet_day, include_credit_cards, bound_at
        INTO v_group
        FROM public.line_group_bindings
        WHERE ledger_id = p_ledger_id
        LIMIT 1;
    END IF;

    IF v_group.ledger_id IS NOT NULL THEN
        v_group_binding := jsonb_build_object(
            'is_bound', true,
            'group_name', v_group.group_name,
            'enabled', v_group.enabled,
            'skip_quiet_day', v_group.skip_quiet_day,
            'include_credit_cards', v_group.include_credit_cards,
            'bound_at', v_group.bound_at
        );
    ELSE
        v_group_binding := jsonb_build_object(
            'is_bound', false,
            'group_name', null,
            'enabled', false,
            'skip_quiet_day', false,
            'include_credit_cards', false,
            'bound_at', null
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_binding', v_user_binding,
        'ledger_subscriptions', v_ledger_subs,
        'group_binding', v_group_binding
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_line_notification_settings(UUID, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_line_user_preferences(
    p_user_id UUID,
    p_enabled BOOLEAN DEFAULT NULL,
    p_skip_quiet_day BOOLEAN DEFAULT NULL,
    p_ledger_id UUID DEFAULT NULL,
    p_ledger_enabled BOOLEAN DEFAULT NULL,
    p_include_summary BOOLEAN DEFAULT NULL,
    p_include_credit_cards BOOLEAN DEFAULT NULL,
    p_include_memos BOOLEAN DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_ids UUID[];
    v_binding_user_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_user', 'message', '無效的使用者識別碼');
    END IF;

    v_user_ids := public.resolve_same_member_ids(p_user_id);

    SELECT user_id INTO v_binding_user_id
    FROM public.line_user_bindings
    WHERE user_id = ANY(v_user_ids)
    ORDER BY (user_id = p_user_id) DESC, updated_at DESC
    LIMIT 1;

    IF v_binding_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_bound', 'message', '尚未完成 LINE 帳號綁定');
    END IF;

    IF p_enabled IS NOT NULL OR p_skip_quiet_day IS NOT NULL THEN
        UPDATE public.line_user_bindings
        SET
            enabled = COALESCE(p_enabled, enabled),
            skip_quiet_day = COALESCE(p_skip_quiet_day, skip_quiet_day),
            updated_at = NOW()
        WHERE user_id = v_binding_user_id;
    END IF;

    IF p_ledger_id IS NOT NULL THEN
        IF p_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN
            RETURN jsonb_build_object('success', false, 'error', 'demo_ledger_not_allowed', 'message', '示範帳本不可設定 LINE 日報');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.ledgers l
            WHERE l.id = p_ledger_id
              AND (
                  l.created_by = ANY(v_user_ids)
                  OR EXISTS (
                      SELECT 1 FROM public.ledger_members lm
                      WHERE lm.ledger_id = p_ledger_id AND lm.user_id = ANY(v_user_ids)
                  )
              )
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'unauthorized_ledger', 'message', '您不是該帳本的成員');
        END IF;

        INSERT INTO public.line_ledger_subscriptions (
            user_id, ledger_id, enabled, include_summary, include_credit_cards, include_memos, updated_at
        ) VALUES (
            v_binding_user_id,
            p_ledger_id,
            COALESCE(p_ledger_enabled, true),
            COALESCE(p_include_summary, true),
            COALESCE(p_include_credit_cards, true),
            COALESCE(p_include_memos, true),
            NOW()
        )
        ON CONFLICT (user_id, ledger_id) DO UPDATE SET
            enabled = COALESCE(p_ledger_enabled, public.line_ledger_subscriptions.enabled),
            include_summary = COALESCE(p_include_summary, public.line_ledger_subscriptions.include_summary),
            include_credit_cards = COALESCE(p_include_credit_cards, public.line_ledger_subscriptions.include_credit_cards),
            include_memos = COALESCE(p_include_memos, public.line_ledger_subscriptions.include_memos),
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.save_line_user_preferences(UUID, BOOLEAN, BOOLEAN, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unbind_line_user(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_ids UUID[];
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_user', 'message', '無效的使用者識別碼');
    END IF;

    v_user_ids := public.resolve_same_member_ids(p_user_id);

    DELETE FROM public.line_ledger_subscriptions WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.line_user_bindings WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.line_bind_tokens WHERE user_id = ANY(v_user_ids) AND target_type = 'user';

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.unbind_line_user(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_line_group_preferences(
    p_ledger_id UUID,
    p_operator_id UUID,
    p_enabled BOOLEAN DEFAULT NULL,
    p_skip_quiet_day BOOLEAN DEFAULT NULL,
    p_include_credit_cards BOOLEAN DEFAULT NULL,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    IF NOT public.can_manage_line_group(p_ledger_id, p_operator_id, p_admin_pin) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能調整家庭群組播報設定');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.line_group_bindings WHERE ledger_id = p_ledger_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_bound', 'message', '此帳本尚未綁定家庭 LINE 群組');
    END IF;

    UPDATE public.line_group_bindings
    SET
        enabled = COALESCE(p_enabled, enabled),
        skip_quiet_day = COALESCE(p_skip_quiet_day, skip_quiet_day),
        include_credit_cards = COALESCE(p_include_credit_cards, include_credit_cards),
        updated_at = NOW()
    WHERE ledger_id = p_ledger_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.save_line_group_preferences(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unbind_line_group(
    p_ledger_id UUID,
    p_operator_id UUID,
    p_admin_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    IF NOT public.can_manage_line_group(p_ledger_id, p_operator_id, p_admin_pin) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '只有帳本管理員才能解除家庭群組綁定');
    END IF;

    DELETE FROM public.line_group_bindings WHERE ledger_id = p_ledger_id;
    DELETE FROM public.line_bind_tokens WHERE ledger_id = p_ledger_id AND target_type = 'group';

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.unbind_line_group(UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- 擴充 payment_accounts 支援網購會員載具卡 ('carrier')
ALTER TABLE public.payment_accounts DROP CONSTRAINT IF EXISTS payment_accounts_type_check;
ALTER TABLE public.payment_accounts ADD CONSTRAINT payment_accounts_type_check 
  CHECK (type IN ('credit_card', 'stored_value', 'cash', 'bank', 'carrier', 'other'));

-- 登記版本履歷記錄
INSERT INTO public.schema_migrations (version, description)
VALUES 
    ('00000000_baseline_schema', '系統全量基準綱要 (Initial Schema)'),
    ('20261030_zero_token_architecture', '零金鑰安全架構、全域 RLS 放行與 14 大核心預存程序'),
    ('20261102_secure_ledger_and_invites_rpc', '零金鑰架構加固：補齊帳本管理、邀請碼與成員維護之 SECURITY DEFINER 預存程序'),
    ('20261105_carrier_account_type', '擴充 payment_accounts 支援網購會員載具卡 (type: carrier)'),
    ('20261108_add_ledger_member_custom_name', '支援家庭成員名冊自訂暱稱與頭像設定'),
    ('20261118_close_anon_door_and_secure_rpc', '封閉未認證提權並加深雙重守護機制'),
    ('20261118_secure_authorized_ledgers_rpc', '強化使用者授權公帳清單查詢安全性'),
    ('20261118_sweethome_read_only_protection', '示範家庭母本雲端唯讀守護'),
    ('20261120_auth_session_links_and_member_dedup', '獨立連線通行證與防成員重複分身純淨守護'),
    ('20261122_add_payment_accounts_issuer_bank', '補齊信用卡發卡機構識別與儲存支援'),
    ('20261122_add_payment_accounts_payment_due_day', '補齊信用卡每月繳款截止日欄位與共用週期支援'),
    ('20261123_add_line_subscriptions', '新增 LINE 個人自主訂閱與家庭群組雙軌日報資料表與安全 RPC')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
