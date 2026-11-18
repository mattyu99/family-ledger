-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：專屬安全通行管道 (Secure Authorized Ledgers RPC & Identity Link)
-- 目的：建立通過 Google 認證使用者的專屬公帳查詢與權限鏈接通道，徹底告別舊式公共走廊
-- 日期：2026-11-18
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 升級核心成員判斷函式 is_ledger_member
--    支援：示範帳本、直接 UID 成員、建立者 UID、以及已通過 Google 驗證的保護身分
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_ledger_member(target_ledger_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- 官方示範帳本 (SWEETHOME) 永遠放行
  IF target_ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid THEN
    RETURN TRUE;
  END IF;

  -- 1. 當前連線直接為該帳本成員或建立者
  IF EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = target_ledger_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.ledgers
    WHERE id = target_ledger_id AND created_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. 檢查當前 Session 是否綁定了受保護的 Google 信箱
  SELECT lower(auth_email) INTO v_user_email
  FROM public.profiles
  WHERE id = auth.uid() AND auth_email IS NOT NULL AND is_locked = true
  LIMIT 1;

  IF v_user_email IS NULL THEN
    v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  END IF;

  -- 3. 若信箱存在，檢查目標帳本中是否有屬於該信箱的成員或建立者
  IF v_user_email IS NOT NULL AND v_user_email <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.ledger_members lm
      JOIN public.profiles p ON lm.user_id = p.id
      WHERE lm.ledger_id = target_ledger_id
        AND lower(p.auth_email) = v_user_email
    ) OR EXISTS (
      SELECT 1 FROM public.ledgers l
      JOIN public.profiles p ON l.created_by = p.id
      WHERE l.id = target_ledger_id
        AND lower(p.auth_email) = v_user_email
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- 2. 專屬公帳查詢與身分合法鏈接 RPC：get_user_authorized_ledgers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_authorized_ledgers(
    p_email TEXT DEFAULT NULL,
    p_link_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_clean_email TEXT;
    v_ledgers JSONB;
    v_matched_ledger_ids UUID[];
BEGIN
    -- 1. 解析目標 Email
    v_clean_email := lower(trim(coalesce(p_email, '')));
    
    -- 若無傳入 Email，嘗試從當前連線 Session 或綁定 profile 中解析
    IF v_clean_email = '' AND auth.uid() IS NOT NULL THEN
        SELECT lower(auth_email) INTO v_clean_email
        FROM public.profiles
        WHERE id = auth.uid() AND auth_email IS NOT NULL;
    END IF;
    
    IF v_clean_email = '' THEN
        v_clean_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    END IF;

    IF v_clean_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '未提供有效的認證信箱');
    END IF;

    -- 2. 安全驗證：確認此 Email 在 profiles 中確實存在且受保護 (防止惡意列舉他人帳本)
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE lower(auth_email) = v_clean_email
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', '此信箱尚未關聯任何家庭公帳');
    END IF;

    -- 3. 若有傳入當前連線 UID (p_link_user_id)，安全將其鏈接至該信箱名下之所有帳本 (解決換機/重新安裝權限問題)
    IF p_link_user_id IS NOT NULL THEN
        SELECT array_agg(DISTINCT l.id) INTO v_matched_ledger_ids
        FROM public.ledgers l
        LEFT JOIN public.ledger_members lm ON l.id = lm.ledger_id
        LEFT JOIN public.profiles p ON (lm.user_id = p.id OR l.created_by = p.id)
        WHERE lower(p.auth_email) = v_clean_email;

        IF v_matched_ledger_ids IS NOT NULL AND array_length(v_matched_ledger_ids, 1) > 0 THEN
            INSERT INTO public.ledger_members (ledger_id, user_id, role, joined_at)
            SELECT unnest(v_matched_ledger_ids), p_link_user_id, 'member', now()
            ON CONFLICT (ledger_id, user_id) DO NOTHING;
        END IF;
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
            COALESCE(lm.custom_name, p.display_name, '家庭成員') AS "userDisplayName",
            COALESCE(lm.custom_avatar, p.avatar_url, '👤') AS "userAvatar"
        FROM public.ledgers l
        LEFT JOIN public.ledger_members lm ON l.id = lm.ledger_id
        LEFT JOIN public.profiles p ON (lm.user_id = p.id OR l.created_by = p.id)
        WHERE lower(p.auth_email) = v_clean_email
           OR l.id = 'ee100000-0000-4000-8000-000000000001'::uuid
        ORDER BY l.id, (lm.role = 'owner') DESC, l.created_at DESC
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
