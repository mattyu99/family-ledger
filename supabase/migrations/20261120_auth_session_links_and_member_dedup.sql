-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：獨立連線通行證 (auth_session_links) 與全公帳重複分身安全合併清理
-- 目的：
--   1. 將「裝置連線授權」與「家庭成員名冊 (ledger_members)」徹底分離，防止換機或重裝產生重複分身
--   2. 升級 is_ledger_member / is_ledger_admin 與各管理類 RPC 支援 auth_session_links 授權驗證
--   3. 補齊 get_user_authorized_ledgers（停止寫入 ledger_members）與新增 link_session_to_email RPC
--   4. 針對所有真實公帳執行一次性三階段重複分身安全移轉與合併清理
-- 日期：2026-11-20
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 建立專用連線通行證表 public.auth_session_links
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 2. 升級 public.is_ledger_member 與新增 public.is_ledger_admin
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. 升級管理類 RPC 支援 is_ledger_admin() 與完整外鍵安全移轉
-- ------------------------------------------------------------------------------

-- 3.1 secure_update_ledger
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

-- 3.2 secure_set_invite_code
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

-- 3.3 delete_cloud_ledger_admin
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

GRANT EXECUTE ON FUNCTION public.delete_cloud_ledger_admin(UUID, TEXT) TO anon, authenticated, service_role;

-- 3.4 secure_remove_member（補齊 is_ledger_admin 權限驗證與完整關聯資產移轉）
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
            -- 先合併與 p_transfer_to_id 在同一筆交易重複的分攤金額並清理衝突列
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

-- ------------------------------------------------------------------------------
-- 4. 升級 get_user_authorized_ledgers（停止寫入 ledger_members）與新增 link_session_to_email
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. 一次性全庫真實公帳安全合併與分身清理
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._migration_merge_ledger_member(
    p_ledger_id UUID,
    p_dup_id UUID,
    p_keep_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_created_by UUID;
    v_email TEXT;
    v_keep_role TEXT;
    v_dup_role TEXT;
BEGIN
    IF p_ledger_id IS NULL OR p_dup_id IS NULL OR p_keep_id IS NULL OR p_dup_id = p_keep_id THEN
        RETURN;
    END IF;

    SELECT created_by INTO v_created_by FROM public.ledgers WHERE id = p_ledger_id;
    -- 絕對安全保護：絕不刪除帳本原始建立者
    IF v_created_by IS NOT NULL AND p_dup_id = v_created_by THEN
        RETURN;
    END IF;

    -- 確認主帳號與分身目前皆仍在該帳本名冊內
    IF NOT EXISTS (SELECT 1 FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_keep_id) THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_dup_id) THEN
        RETURN;
    END IF;

    -- 5.1 先替分身 UID 補建 auth_session_links 通行證，確保舊裝置不斷線
    SELECT lower(trim(auth_email)) INTO v_email
    FROM public.profiles
    WHERE id = p_keep_id
      AND auth_email IS NOT NULL
      AND trim(auth_email) <> ''
      AND position('@' in auth_email) > 0
      AND right(lower(trim(auth_email)), 13) <> '@family.local'
      AND lower(auth_email) NOT LIKE '%anonymous%'
    LIMIT 1;

    IF v_email IS NULL OR v_email = '' THEN
        SELECT lower(trim(auth_email)) INTO v_email
        FROM public.profiles
        WHERE id = p_dup_id
          AND auth_email IS NOT NULL
          AND trim(auth_email) <> ''
          AND position('@' in auth_email) > 0
          AND right(lower(trim(auth_email)), 13) <> '@family.local'
          AND lower(auth_email) NOT LIKE '%anonymous%'
        LIMIT 1;
    END IF;

    IF v_email IS NOT NULL AND v_email <> '' THEN
        INSERT INTO public.auth_session_links (session_uid, auth_email, linked_at)
        VALUES (p_dup_id, v_email, NOW())
        ON CONFLICT (session_uid) DO UPDATE
        SET auth_email = EXCLUDED.auth_email,
            linked_at = NOW();
    END IF;

    -- 5.2 保留最高成員角色
    SELECT role INTO v_keep_role FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_keep_id;
    SELECT role INTO v_dup_role FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_dup_id;
    IF v_dup_role = 'owner' AND COALESCE(v_keep_role, 'member') <> 'owner' THEN
        UPDATE public.ledger_members SET role = 'owner' WHERE ledger_id = p_ledger_id AND user_id = p_keep_id;
    ELSIF v_dup_role = 'admin' AND COALESCE(v_keep_role, 'member') = 'member' THEN
        UPDATE public.ledger_members SET role = 'admin' WHERE ledger_id = p_ledger_id AND user_id = p_keep_id;
    END IF;

    -- 5.3 移轉 transactions (creator_id / paid_by)
    UPDATE public.transactions SET creator_id = p_keep_id WHERE ledger_id = p_ledger_id AND creator_id = p_dup_id;
    UPDATE public.transactions SET paid_by = p_keep_id WHERE ledger_id = p_ledger_id AND paid_by = p_dup_id;

    -- 5.4 移轉 transaction_splits（先合併同筆交易衝突之分攤金額）
    IF to_regclass('public.transaction_splits') IS NOT NULL THEN
        UPDATE public.transaction_splits ts_keep
        SET split_amount = COALESCE(ts_keep.split_amount, 0) + COALESCE(ts_dup.split_amount, 0)
        FROM public.transaction_splits ts_dup
        JOIN public.transactions t ON t.id = ts_dup.transaction_id
        WHERE t.ledger_id = p_ledger_id
          AND ts_dup.user_id = p_dup_id
          AND ts_keep.transaction_id = ts_dup.transaction_id
          AND ts_keep.user_id = p_keep_id;

        DELETE FROM public.transaction_splits ts_dup
        USING public.transactions t
        WHERE ts_dup.transaction_id = t.id
          AND t.ledger_id = p_ledger_id
          AND ts_dup.user_id = p_dup_id
          AND EXISTS (
              SELECT 1 FROM public.transaction_splits ts_keep
              WHERE ts_keep.transaction_id = ts_dup.transaction_id
                AND ts_keep.user_id = p_keep_id
          );

        UPDATE public.transaction_splits ts
        SET user_id = p_keep_id
        FROM public.transactions t
        WHERE ts.transaction_id = t.id
          AND t.ledger_id = p_ledger_id
          AND ts.user_id = p_dup_id;
    END IF;

    -- 5.5 移轉 payment_accounts
    UPDATE public.payment_accounts SET user_id = p_keep_id WHERE ledger_id = p_ledger_id AND user_id = p_dup_id;

    -- 5.6 移轉 recurring_rules
    UPDATE public.recurring_rules SET paid_by = p_keep_id WHERE ledger_id = p_ledger_id AND paid_by = p_dup_id;

    -- 5.7 移轉 member_devices（先避開 (ledger_id, device_id) 衝突）
    DELETE FROM public.member_devices md_dup
    WHERE md_dup.ledger_id = p_ledger_id
      AND md_dup.member_id = p_dup_id
      AND EXISTS (
          SELECT 1 FROM public.member_devices md_keep
          WHERE md_keep.ledger_id = p_ledger_id
            AND md_keep.member_id = p_keep_id
            AND md_keep.device_id = md_dup.device_id
      );

    UPDATE public.member_devices
    SET member_id = p_keep_id
    WHERE ledger_id = p_ledger_id AND member_id = p_dup_id;

    -- 5.8 移轉 ledger_budgets.member_budgets JSONB
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
        USING p_keep_id, p_dup_id, p_ledger_id;
    END IF;

    -- 5.9 若存在 carrier_rules 表亦安全移轉
    IF to_regclass('public.carrier_rules') IS NOT NULL THEN
        EXECUTE 'UPDATE public.carrier_rules SET user_id = $1 WHERE ledger_id = $2 AND user_id = $3'
        USING p_keep_id, p_ledger_id, p_dup_id;
    END IF;

    -- 5.10 僅移除該公帳的 ledger_members 關聯（絕不刪除 profiles 本體，不影響其他帳本）
    DELETE FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_dup_id;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    v_grp RECORD;
    v_dup RECORD;
    v_keep_id UUID;
    v_leak RECORD;
    v_ghost RECORD;
BEGIN
    -- --------------------------------------------------------------------------
    -- 階段 A：同真實帳本內、相同真實 Google auth_email 的重複成員安全合併
    -- --------------------------------------------------------------------------
    FOR v_grp IN
        SELECT
            lm.ledger_id,
            lower(trim(p.auth_email)) AS norm_email
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id NOT IN (
            'ee100000-0000-4000-8000-000000000001'::uuid,
            '10000000-0000-4000-8000-000000000001'::uuid
        )
          AND p.auth_email IS NOT NULL
          AND trim(p.auth_email) <> ''
          AND position('@' in p.auth_email) > 0
          AND right(lower(trim(p.auth_email)), 13) <> '@family.local'
          AND lower(p.auth_email) NOT LIKE '%anonymous%'
        GROUP BY lm.ledger_id, lower(trim(p.auth_email))
        HAVING count(*) >= 2
    LOOP
        SELECT lm.user_id INTO v_keep_id
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id = v_grp.ledger_id
          AND p.auth_email IS NOT NULL
          AND lower(trim(p.auth_email)) = v_grp.norm_email
        ORDER BY
            COALESCE(l.created_by = lm.user_id, FALSE) DESC,
            (SELECT count(*) FROM public.member_devices md WHERE md.ledger_id = lm.ledger_id AND md.member_id = lm.user_id) DESC,
            COALESCE(p.is_locked, FALSE) DESC,
            (coalesce(nullif(trim(lm.custom_avatar), ''), p.avatar_url, '') NOT LIKE 'http%') DESC,
            (SELECT count(*) FROM public.transactions t WHERE t.ledger_id = lm.ledger_id AND (t.paid_by = lm.user_id OR t.creator_id = lm.user_id)) DESC,
            lm.joined_at ASC NULLS LAST
        LIMIT 1;

        FOR v_dup IN
            SELECT lm.user_id
            FROM public.ledger_members lm
            JOIN public.profiles p ON p.id = lm.user_id
            WHERE lm.ledger_id = v_grp.ledger_id
              AND p.auth_email IS NOT NULL
              AND lower(trim(p.auth_email)) = v_grp.norm_email
              AND lm.user_id <> v_keep_id
        LOOP
            PERFORM public._migration_merge_ledger_member(v_grp.ledger_id, v_dup.user_id, v_keep_id);
        END LOOP;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 階段 B：同真實帳本內、同名未上鎖／無真實信箱的分身與 Google HTTP 頭像影子合併
    -- --------------------------------------------------------------------------
    FOR v_grp IN
        SELECT
            lm.ledger_id,
            lower(trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, ''))) AS norm_name
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id NOT IN (
            'ee100000-0000-4000-8000-000000000001'::uuid,
            '10000000-0000-4000-8000-000000000001'::uuid
        )
          AND trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, '')) <> ''
          AND trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, '')) <> '家庭成員'
        GROUP BY lm.ledger_id, lower(trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, '')))
        HAVING count(*) >= 2
    LOOP
        SELECT lm.user_id INTO v_keep_id
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id = v_grp.ledger_id
          AND lower(trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, ''))) = v_grp.norm_name
        ORDER BY
            COALESCE(l.created_by = lm.user_id, FALSE) DESC,
            (SELECT count(*) FROM public.member_devices md WHERE md.ledger_id = lm.ledger_id AND md.member_id = lm.user_id) DESC,
            COALESCE(p.is_locked, FALSE) DESC,
            (
                p.auth_email IS NOT NULL
                AND trim(p.auth_email) <> ''
                AND position('@' in p.auth_email) > 0
                AND right(lower(trim(p.auth_email)), 13) <> '@family.local'
                AND lower(p.auth_email) NOT LIKE '%anonymous%'
            ) DESC,
            (coalesce(p.avatar_url, '') NOT LIKE 'http%') DESC,
            (SELECT count(*) FROM public.transactions t WHERE t.ledger_id = lm.ledger_id AND (t.paid_by = lm.user_id OR t.creator_id = lm.user_id)) DESC,
            lm.joined_at ASC NULLS LAST
        LIMIT 1;

        FOR v_dup IN
            SELECT lm.user_id
            FROM public.ledger_members lm
            JOIN public.ledgers l ON l.id = lm.ledger_id
            JOIN public.profiles p ON p.id = lm.user_id
            WHERE lm.ledger_id = v_grp.ledger_id
              AND lower(trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, ''))) = v_grp.norm_name
              AND lm.user_id <> v_keep_id
              AND lm.user_id IS DISTINCT FROM l.created_by
              AND (p.is_locked IS NOT TRUE)
              AND (
                  p.auth_email IS NULL
                  OR trim(p.auth_email) = ''
                  OR position('@' in p.auth_email) = 0
                  OR right(lower(trim(p.auth_email)), 13) = '@family.local'
                  OR lower(p.auth_email) LIKE '%anonymous%'
              )
        LOOP
            PERFORM public._migration_merge_ledger_member(v_grp.ledger_id, v_dup.user_id, v_keep_id);
        END LOOP;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 階段 C：清理真實帳本殘留之示範污染成員與空/預設「家庭成員」幽靈
    -- --------------------------------------------------------------------------
    FOR v_leak IN
        SELECT
            lm.ledger_id,
            lm.user_id,
            l.created_by
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        LEFT JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id NOT IN (
            'ee100000-0000-4000-8000-000000000001'::uuid,
            '10000000-0000-4000-8000-000000000001'::uuid
        )
          AND lm.user_id IS DISTINCT FROM l.created_by
          AND COALESCE(p.is_locked, FALSE) = FALSE
          AND (
              p.auth_email IS NULL
              OR trim(p.auth_email) = ''
              OR position('@' in p.auth_email) = 0
              OR right(lower(trim(p.auth_email)), 13) = '@family.local'
              OR lower(p.auth_email) LIKE '%anonymous%'
          )
          AND (
              lm.user_id IN (
                  'ee200000-0000-4000-8000-000000000001'::uuid,
                  'ee200000-0000-4000-8000-000000000002'::uuid,
                  'ee200000-0000-4000-8000-000000000003'::uuid,
                  'ee200000-0000-4000-8000-000000000004'::uuid,
                  '20000000-0000-4000-8000-000000000001'::uuid,
                  '20000000-0000-4000-8000-000000000002'::uuid,
                  '20000000-0000-4000-8000-000000000003'::uuid
              )
              OR trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, '')) IN (
                  '智爸 (爸爸)',
                  '瑩媽 (媽媽)',
                  '洋洋 (哥哥)',
                  '豆豆 (妹妹)'
              )
          )
          AND EXISTS (
              -- 僅在該帳本至少還有一位其他非示範成員時才執行清理
              SELECT 1
              FROM public.ledger_members lm_other
              LEFT JOIN public.profiles p_other ON p_other.id = lm_other.user_id
              WHERE lm_other.ledger_id = lm.ledger_id
                AND lm_other.user_id <> lm.user_id
                AND trim(coalesce(nullif(trim(lm_other.custom_name), ''), p_other.display_name, '')) NOT IN (
                    '', '家庭成員', '智爸 (爸爸)', '瑩媽 (媽媽)', '洋洋 (哥哥)', '豆豆 (妹妹)'
                )
          )
    LOOP
        v_keep_id := NULL;
        IF v_leak.created_by IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.ledger_members lm_c
            WHERE lm_c.ledger_id = v_leak.ledger_id AND lm_c.user_id = v_leak.created_by
        ) THEN
            v_keep_id := v_leak.created_by;
        ELSE
            SELECT lm_c.user_id INTO v_keep_id
            FROM public.ledger_members lm_c
            LEFT JOIN public.profiles p_c ON p_c.id = lm_c.user_id
            WHERE lm_c.ledger_id = v_leak.ledger_id
              AND lm_c.user_id <> v_leak.user_id
            ORDER BY
                COALESCE(lm_c.role = 'owner', FALSE) DESC,
                COALESCE(p_c.is_locked, FALSE) DESC,
                lm_c.joined_at ASC NULLS LAST
            LIMIT 1;
        END IF;

        IF v_keep_id IS NOT NULL THEN
            PERFORM public._migration_merge_ledger_member(v_leak.ledger_id, v_leak.user_id, v_keep_id);
        END IF;
    END LOOP;

    -- 清理 0 交易且已有具名成員的空/預設「家庭成員」幽靈
    FOR v_ghost IN
        SELECT lm.ledger_id, lm.user_id
        FROM public.ledger_members lm
        JOIN public.ledgers l ON l.id = lm.ledger_id
        LEFT JOIN public.profiles p ON p.id = lm.user_id
        WHERE lm.ledger_id NOT IN (
            'ee100000-0000-4000-8000-000000000001'::uuid,
            '10000000-0000-4000-8000-000000000001'::uuid
        )
          AND lm.user_id IS DISTINCT FROM l.created_by
          AND COALESCE(p.is_locked, FALSE) = FALSE
          AND (
              p.auth_email IS NULL
              OR trim(p.auth_email) = ''
              OR position('@' in p.auth_email) = 0
              OR right(lower(trim(p.auth_email)), 13) = '@family.local'
              OR lower(p.auth_email) LIKE '%anonymous%'
          )
          AND trim(coalesce(nullif(trim(lm.custom_name), ''), p.display_name, '')) IN ('', '家庭成員')
          AND NOT EXISTS (
              SELECT 1 FROM public.transactions t
              WHERE t.ledger_id = lm.ledger_id
                AND (t.paid_by = lm.user_id OR t.creator_id = lm.user_id)
          )
          AND EXISTS (
              SELECT 1
              FROM public.ledger_members lm_named
              LEFT JOIN public.profiles p_named ON p_named.id = lm_named.user_id
              WHERE lm_named.ledger_id = lm.ledger_id
                AND lm_named.user_id <> lm.user_id
                AND trim(coalesce(nullif(trim(lm_named.custom_name), ''), p_named.display_name, '')) NOT IN ('', '家庭成員')
          )
    LOOP
        DELETE FROM public.ledger_members
        WHERE ledger_id = v_ghost.ledger_id AND user_id = v_ghost.user_id;

        DELETE FROM public.member_devices
        WHERE ledger_id = v_ghost.ledger_id AND member_id = v_ghost.user_id;
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public._migration_merge_ledger_member(UUID, UUID, UUID);

-- ------------------------------------------------------------------------------
-- 6. 登記遷移履歷至 schema_migrations
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, description)
SELECT
    '20261120_auth_session_links_and_member_dedup',
    '建立獨立連線通行證表 auth_session_links、升級權限 RPC 並完成全真實公帳重複分身安全合併清理'
WHERE NOT EXISTS (
    SELECT 1 FROM public.schema_migrations
    WHERE version = '20261120_auth_session_links_and_member_dedup'
);
