-- ==============================================================================
-- 20261123: LINE 個人自主訂閱與家庭群組雙軌日報資料表與安全 RPC (Zero-Token)
-- ==============================================================================
-- 安全原則：
-- 1. 4 張底層表全面啟用 RLS，不開放匿名或一般登入者直接 SELECT，保護家人 line_user_id 與群組 ID。
-- 2. 所有 App 端查詢與設定皆透過 SECURITY DEFINER RPC 執行，絕不向前端回傳裸露 LINE ID。
-- 3. 嚴格排除官方示範帳本 (ee100000-0000-4000-8000-000000000001)。

-- 1. 成員 LINE 個人綁定與全域偏好表
CREATE TABLE IF NOT EXISTS public.line_user_bindings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL UNIQUE,
    line_display_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    skip_quiet_day BOOLEAN NOT NULL DEFAULT FALSE,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 成員各帳簿 LINE 日報訂閱清單表
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

-- 3. 家庭帳本綁定 LINE 群組表（每本家庭帳本最多綁定一個公開播報群組）
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

-- 4. 一次性 LINE 綁定驗證碼暫存表（10 分鐘效期）
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

-- 啟用 RLS：僅允許 service_role (Edge Function / Daily Report) 直接讀寫底層表
ALTER TABLE public.line_user_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_ledger_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_group_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_bind_tokens ENABLE ROW LEVEL SECURITY;

-- 輔助函式（內部使用）：解析同一 Google 信箱關聯之成員 Profile IDs
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

-- 輔助函式（內部使用）：驗證是否具備管理該帳本家庭群組 LINE 綁定的權限
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

-- RPC 1：產生 10 分鐘有效的 LINE 綁定碼（個人 BIND-XXXXXX 或 群組 GRP-XXXXXX）
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

    -- 清除已過期或同一對象尚未使用的舊綁定碼
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

-- RPC 2：查詢成員個人 LINE 綁定狀態、名下帳簿訂閱與目前帳本群組綁定狀態（絕不外洩 LINE ID）
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

    -- 取得該成員有加入的非示範帳簿及其訂閱狀態
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

-- RPC 3：儲存成員個人 LINE 全域開關與個別帳簿訂閱偏好
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

-- RPC 4：解除個人 LINE 綁定
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

-- RPC 5：儲存家庭 LINE 群組公開播報偏好
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

-- RPC 6：解除家庭 LINE 群組綁定
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

-- 登記遷移履歷
INSERT INTO public.schema_migrations (version, description)
VALUES ('20261123_add_line_subscriptions', '新增 LINE 個人自主訂閱與家庭群組雙軌日報資料表與安全 RPC')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
