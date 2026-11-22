-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：補齊 payment_accounts.payment_due_day 欄位與零金鑰 RPC 讀寫支援
-- 目的：支援信用卡每月繳款截止日設定（含同銀行共用與跨月繳款日提醒）
-- 日期：2026-11-22
-- ==============================================================================

-- 1. 為 payment_accounts 補齊 payment_due_day 欄位（可空 INT，每月 1~31 號）
ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS payment_due_day INT;

-- 2. 升級安全新增付款卡片 RPC：完整寫入與衝突更新 issuer_bank 與 payment_due_day
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

-- 3. 升級安全更新付款卡片 RPC：支援設定與清除 issuer_bank 與 payment_due_day
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

-- 4. 登記遷移履歷至 schema_migrations 表
INSERT INTO public.schema_migrations (version, description)
SELECT '20261122_add_payment_accounts_payment_due_day', '補齊 payment_accounts.payment_due_day 欄位並升級新增/更新卡片 RPC 讀寫支援'
WHERE NOT EXISTS (
    SELECT 1 FROM public.schema_migrations WHERE version = '20261122_add_payment_accounts_payment_due_day'
);
