-- ==============================================================================
-- 家庭共同記帳 APP (Family Ledger) - Supabase 資料庫建置腳本 (PostgreSQL + RLS)
-- ==============================================================================

-- 啟用 UUID 擴充功能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 使用者個人資料表 (與 Supabase auth.users 連動)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- 3. 帳本成員關聯表 (角色與權限)
CREATE TABLE IF NOT EXISTS public.ledger_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('owner', 'admin', 'member', 'viewer')) DEFAULT 'member' NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (ledger_id, user_id)
);

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
    type TEXT CHECK (type IN ('expense', 'income', 'transfer')) DEFAULT 'expense' NOT NULL,
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- 實際付款人/代墊人
    transacted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    note TEXT,
    image_url TEXT, -- 收據或發票照片網址
    is_settled BOOLEAN DEFAULT FALSE NOT NULL, -- 針對代墊款是否已結清
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. 分帳/拆帳明細表 (代墊與分攤)
CREATE TABLE IF NOT EXISTS public.transaction_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- 應分攤的成員
    split_amount NUMERIC(12, 2) NOT NULL, -- 應負擔的金額
    is_settled BOOLEAN DEFAULT FALSE NOT NULL,
    settled_at TIMESTAMPTZ
);

-- 7. 帳本邀請碼表 (家人快速加入)
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
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_invites ENABLE ROW LEVEL SECURITY;

-- 檢查當前登入者是否屬於特定帳本成員的輔助函式（包含建立者與已加入成員）
CREATE OR REPLACE FUNCTION public.is_ledger_member(target_ledger_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = target_ledger_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.ledgers
    WHERE id = target_ledger_id AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles 規則：任何人可讀取個人公開資訊，自己可新增與修改
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

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

-- Splits 規則
DROP POLICY IF EXISTS "Members can view splits" ON public.transaction_splits;
CREATE POLICY "Members can view splits" ON public.transaction_splits FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_splits.transaction_id AND public.is_ledger_member(t.ledger_id)));

DROP POLICY IF EXISTS "Members can manage splits" ON public.transaction_splits;
CREATE POLICY "Members can manage splits" ON public.transaction_splits FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_splits.transaction_id AND public.is_ledger_member(t.ledger_id)));

-- Invites 規則
DROP POLICY IF EXISTS "Members can view ledger invites" ON public.ledger_invites;
CREATE POLICY "Members can view ledger invites" ON public.ledger_invites FOR SELECT 
  USING (public.is_ledger_member(ledger_id));

DROP POLICY IF EXISTS "Admins can manage invites" ON public.ledger_invites;
CREATE POLICY "Admins can manage invites" ON public.ledger_invites FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.ledger_members lm WHERE lm.ledger_id = ledger_invites.ledger_id AND lm.user_id = auth.uid() AND lm.role IN ('owner', 'admin')));

-- ==============================================================================
-- 自動化觸發器 (Triggers)：新使用者註冊時，自動建立 Profile 與 預設家庭帳本及分類
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_ledger_id UUID;
BEGIN
    -- 1. 建立 Profile
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NULLIF(split_part(NEW.email, '@', 1), ''), '家庭成員'),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '👨')
    );

    -- 2. 為新使用者預設建立一本「幸福家庭帳本」
    INSERT INTO public.ledgers (name, description, currency, created_by)
    VALUES ('幸福家庭帳本', '全家共享日常開銷帳本', 'TWD', NEW.id)
    RETURNING id INTO new_ledger_id;

    -- 3. 將使用者加入為此帳本的 Owner
    INSERT INTO public.ledger_members (ledger_id, user_id, role)
    VALUES (new_ledger_id, NEW.id, 'owner');

    -- 4. 建立常用的預設支出與收入分類
    INSERT INTO public.categories (ledger_id, name, icon, color, type, sort_order) VALUES
    (new_ledger_id, '餐飲伙食', '🍲', '#EF4444', 'expense', 1),
    (new_ledger_id, '生鮮超市', '🛒', '#F59E0B', 'expense', 2),
    (new_ledger_id, '居家水電', '💡', '#3B82F6', 'expense', 3),
    (new_ledger_id, '交通出行', '🚗', '#10B981', 'expense', 4),
    (new_ledger_id, '休閒娛樂', '🎬', '#8B5CF6', 'expense', 5),
    (new_ledger_id, '醫療保健', '💊', '#EC4899', 'expense', 6),
    (new_ledger_id, '薪資收入', '💰', '#059669', 'income', 1),
    (new_ledger_id, '投資理財', '📈', '#2563EB', 'income', 2);

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
END $$;
