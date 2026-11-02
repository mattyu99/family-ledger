-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：零金鑰架構深化 (Zero-Token Security Architecture Hardening)
-- 目的：全面補齊管理類 RPC 預存程序，徹底消滅免登入管理員更新帳本、門禁、邀請碼與成員時的「靜默更新 0 筆」與權限盲區
-- 日期：2026-11-02
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 安全更新帳本設定 (名稱、唯讀鎖、門禁安全鎖、貨幣、描述)
-- ------------------------------------------------------------------------------
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

    -- 權限查核：三軌彈性校驗
    -- 軌道 1：透過 Supabase Auth Session (Google 登入成員)
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members 
            WHERE ledger_id = p_ledger_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = auth.uid()
        );
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

    -- 軌道 3：透過管理員 PIN 碼驗證 (離線提權、跨裝置管理)
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

    -- 執行更新
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

GRANT EXECUTE ON FUNCTION public.secure_update_ledger(UUID, JSONB, UUID, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. 安全重設或自訂邀請碼 (原子化跨帳本重複檢測、舊碼作廢與新碼入庫)
-- ------------------------------------------------------------------------------
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

    -- 權限查核
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members 
            WHERE ledger_id = p_ledger_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = auth.uid()
        );
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

    -- 跨帳本檢測是否與其他家庭衝突
    IF EXISTS (
        SELECT 1 FROM public.ledger_invites 
        WHERE UPPER(TRIM(invite_code)) = v_clean_code AND ledger_id != p_ledger_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'code_taken', 'message', '此自訂邀請碼已被其他家庭使用，請換一個！');
    END IF;

    -- 作廢舊碼
    DELETE FROM public.ledger_invites WHERE ledger_id = p_ledger_id;

    -- 寫入新碼
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

GRANT EXECUTE ON FUNCTION public.secure_set_invite_code(UUID, TEXT, UUID, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. 安全移除成員與交易明細外鍵移轉
-- ------------------------------------------------------------------------------
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
BEGIN
    -- 權限查核
    IF auth.uid() IS NOT NULL THEN
        v_is_authorized := EXISTS (
            SELECT 1 FROM public.ledger_members 
            WHERE ledger_id = p_ledger_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        ) OR EXISTS (
            SELECT 1 FROM public.ledgers WHERE id = p_ledger_id AND created_by = auth.uid()
        );
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

    -- 移轉舊明細外鍵避免約束阻擋
    IF p_transfer_to_id IS NOT NULL THEN
        UPDATE public.transactions SET creator_id = p_transfer_to_id WHERE ledger_id = p_ledger_id AND creator_id = p_user_id;
        UPDATE public.transactions SET paid_by = p_transfer_to_id WHERE ledger_id = p_ledger_id AND paid_by = p_user_id;
    END IF;

    -- 刪除成員與裝置關聯
    DELETE FROM public.ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_user_id;
    DELETE FROM public.member_devices WHERE ledger_id = p_ledger_id AND member_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_remove_member(UUID, UUID, UUID, UUID, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. 登記遷移履歷至資料庫版本表 (schema_migrations)
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, description)
VALUES ('20261102_secure_ledger_and_invites_rpc', '零金鑰架構加固：補齊帳本管理、邀請碼與成員維護之 SECURITY DEFINER 預存程序')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
