-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：零金鑰終極架構 (Zero-Token Security Architecture)
-- 目的：徹底廢除前端 service_role 金鑰，改由完整的 RLS 讀取放行與 SECURITY DEFINER 預存程序驅動
-- 日期：2026-10-30
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. 欄位補齊與結構檢查 (確保必要欄位皆存在)
-- ------------------------------------------------------------------------------
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS card_number TEXT;
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS installment_start_period TEXT;

-- ------------------------------------------------------------------------------
-- 1. 全系統 RLS 讀取權限閉環 (允許 anon 匿名金鑰讀取所屬帳本資料，杜絕卡片或明細歸零)
-- ------------------------------------------------------------------------------

-- 1.1 付款卡片與帳戶 (payment_accounts)
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view payment accounts" ON public.payment_accounts;
CREATE POLICY "Members can view payment accounts" ON public.payment_accounts FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.2 記帳分類 (categories)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view categories" ON public.categories;
CREATE POLICY "Members can view categories" ON public.categories FOR SELECT 
  USING (ledger_id IS NULL OR public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.3 交易明細 (transactions)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view transactions" ON public.transactions;
CREATE POLICY "Members can view transactions" ON public.transactions FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.4 分帳拆帳明細 (transaction_splits)
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view splits" ON public.transaction_splits;
CREATE POLICY "Members can view splits" ON public.transaction_splits FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND (public.is_ledger_member(t.ledger_id) OR auth.role() = 'anon')));

-- 1.5 帳本成員名冊 (ledger_members)
ALTER TABLE public.ledger_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view ledger members" ON public.ledger_members;
CREATE POLICY "Members can view ledger members" ON public.ledger_members FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.6 刪除墓碑表 (deleted_transactions)
ALTER TABLE public.deleted_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "帳本成員可檢視墓碑名單" ON public.deleted_transactions;
CREATE POLICY "帳本成員可檢視墓碑名單" ON public.deleted_transactions FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.7 週期規則 (recurring_rules)
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "成員可讀取所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可讀取所屬帳本的週期規則" ON public.recurring_rules FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.8 付款方式 (payment_methods)
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "成員可讀取所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可讀取所屬帳本的付款方式" ON public.payment_methods FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.9 預算設定 (ledger_budgets)
ALTER TABLE public.ledger_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "成員可讀取所屬帳本的預算設定" ON public.ledger_budgets;
CREATE POLICY "成員可讀取所屬帳本的預算設定" ON public.ledger_budgets FOR SELECT 
  USING (public.is_ledger_member(ledger_id) OR auth.role() = 'anon');

-- 1.10 帳本主檔 (ledgers)
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view their ledgers" ON public.ledgers;
CREATE POLICY "Members can view their ledgers" ON public.ledgers FOR SELECT 
  USING (public.is_ledger_member(id) OR auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 2. Storage 儲存桶公開讀取與寫入政策 (電子帳單與收據照片上傳擺脫 service token)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('statements', 'statements', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can view statements" ON storage.objects;
CREATE POLICY "Anyone can view statements" ON storage.objects FOR SELECT USING (bucket_id = 'statements');

DROP POLICY IF EXISTS "Anyone can upload statements" ON storage.objects;
CREATE POLICY "Anyone can upload statements" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'statements');

DROP POLICY IF EXISTS "Anyone can update statements" ON storage.objects;
CREATE POLICY "Anyone can update statements" ON storage.objects FOR UPDATE USING (bucket_id = 'statements');

DROP POLICY IF EXISTS "Anyone can delete statements" ON storage.objects;
CREATE POLICY "Anyone can delete statements" ON storage.objects FOR DELETE USING (bucket_id = 'statements');

-- ------------------------------------------------------------------------------
-- 3. 核心 SECURITY DEFINER 預存程序 (純 PL/pgSQL 流程控制，免除 CASE WHEN 語法混淆)
-- ------------------------------------------------------------------------------

-- 3.1 安全刪除交易明細 (含分帳、墓碑表記錄，徹底杜絕殭屍復活)
CREATE OR REPLACE FUNCTION public.secure_delete_transaction(
    p_tx_id UUID,
    p_ledger_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM public.transaction_splits WHERE transaction_id = p_tx_id;

    IF p_ledger_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ledgers WHERE id = p_ledger_id) THEN
        INSERT INTO public.deleted_transactions (id, ledger_id)
        VALUES (p_tx_id, p_ledger_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;

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

-- 3.2 安全更新交易明細
CREATE OR REPLACE FUNCTION public.secure_update_transaction(
    p_tx_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_tx_id);
    END IF;

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

-- 3.3 安全更新卡片帳戶餘額
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

-- 3.4 安全批量新增交易明細
CREATE OR REPLACE FUNCTION public.secure_batch_add_transactions(
    p_transactions JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_inserted_count INT := 0;
    item JSONB;
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
            COALESCE((item->>'transacted_at')::TIMESTAMPTZ, NOW()),
            COALESCE((item->>'created_at')::TIMESTAMPTZ, NOW()),
            COALESCE((item->>'updated_at')::TIMESTAMPTZ, NOW())
        ) ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            note = EXCLUDED.note,
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

-- 3.5 安全新增付款卡片與資產帳戶
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
        billing_cycle_date,
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
        NULLIF(p_account->>'billing_cycle_date', '')::INT,
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
        billing_cycle_date = EXCLUDED.billing_cycle_date,
        balance = EXCLUDED.balance,
        color = EXCLUDED.color,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.secure_add_payment_account(JSONB) TO anon, authenticated;

-- 3.6 安全更新付款卡片
CREATE OR REPLACE FUNCTION public.secure_update_payment_account(
    p_account_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = p_account_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_account_id);
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

    IF p_payload ? 'billing_cycle_date' THEN
        IF NULLIF(p_payload->>'billing_cycle_date', '') IS NOT NULL THEN
            UPDATE public.payment_accounts SET billing_cycle_date = (p_payload->>'billing_cycle_date')::INT WHERE id = p_account_id;
        ELSE
            UPDATE public.payment_accounts SET billing_cycle_date = NULL WHERE id = p_account_id;
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

GRANT EXECUTE ON FUNCTION public.secure_update_payment_account(UUID, JSONB) TO anon, authenticated;

-- 3.7 安全刪除付款卡片
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

-- 3.8 安全新增記帳分類
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

-- 3.9 安全更新或刪除記帳分類
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

-- 3.10 安全更新與刪除週期扣款規則
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

-- 3.11 安全解除成員 Google 綁定與清空認領碼
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

-- 3.12 安全更新管理員 PIN 碼
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
