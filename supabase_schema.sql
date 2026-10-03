-- ==============================================================================
-- 家庭共同記帳 APP (Family Ledger) - Supabase 資料庫建置腳本 (PostgreSQL + RLS)
-- ==============================================================================

-- 啟用 UUID 擴充功能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Profiles 規則：任何人可讀取個人公開資訊，已認證成員可新增與修改
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
CREATE POLICY "Anyone can insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
CREATE POLICY "Anyone can update profiles" ON public.profiles FOR UPDATE USING (true);

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
CREATE OR REPLACE FUNCTION public.join_ledger_by_invite(invite_code_input TEXT)
RETURNS JSONB AS $$
DECLARE
    target_invite RECORD;
    target_ledger RECORD;
    assigned_role TEXT;
BEGIN
    SELECT * INTO target_invite FROM public.ledger_invites
    WHERE UPPER(TRIM(invite_code)) = UPPER(TRIM(invite_code_input))
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到此邀請碼或邀請碼已失效');
    END IF;

    SELECT * INTO target_ledger FROM public.ledgers WHERE id = target_invite.ledger_id;

    -- 若目前呼叫者為該帳本建立者，角色自動恢復為 'owner'；其餘家人則為 'member'
    IF target_ledger.created_by = auth.uid() THEN
        assigned_role := 'owner';
    ELSE
        assigned_role := 'member';
    END IF;

    -- 先嘗試更新既有成員紀錄之角色
    UPDATE public.ledger_members
    SET role = assigned_role
    WHERE ledger_id = target_invite.ledger_id AND user_id = auth.uid();

    -- 若尚未加入過，則新增成員紀錄
    IF NOT FOUND THEN
        INSERT INTO public.ledger_members (ledger_id, user_id, role)
        VALUES (target_invite.ledger_id, auth.uid(), assigned_role);
    END IF;

    -- 累加已使用次數
    UPDATE public.ledger_invites
    SET used_count = used_count + 1
    WHERE id = target_invite.id;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', target_ledger.id,
        'ledger_name', target_ledger.name,
        'invite_code', target_invite.invite_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 新增家庭成員的 RPC 函式 (SECURITY DEFINER 原子交易，自動寫入 profiles 與 ledger_members)
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

-- 變更成員角色權限的 RPC 函式 (管理員可指派共同管理員或降為一般成員)
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
END $$;
