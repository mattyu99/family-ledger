-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：資料庫安全預存程序 (SECURITY DEFINER RPCs)
-- 目的：取代前端的 service_role 超級管理員金鑰，將高權限穿透操作收斂至受控的資料庫內部
-- 日期：2026-10-30
-- ==============================================================================

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

    -- 1.2 寫入墓碑表以防舊裝置復活
    INSERT INTO public.deleted_transactions (id, ledger_id)
    VALUES (p_tx_id, p_ledger_id)
    ON CONFLICT (id) DO NOTHING;

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

-- 2. 安全更新交易明細 (支援生活記事打勾、回報備註、對帳標記與動態欄位更新)
CREATE OR REPLACE FUNCTION public.secure_update_transaction(
    p_tx_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    UPDATE public.transactions
    SET
        amount = CASE 
            WHEN p_payload ? 'amount' AND (p_payload->>'amount') IS NOT NULL 
            THEN (p_payload->>'amount')::NUMERIC 
            ELSE amount 
        END,
        type = CASE 
            WHEN p_payload ? 'type' AND (p_payload->>'type') IS NOT NULL 
            THEN (p_payload->>'type') 
            ELSE type 
        END,
        category_id = CASE 
            WHEN p_payload ? 'category_id' 
            THEN (p_payload->>'category_id')::UUID 
            ELSE category_id 
        END,
        paid_by = CASE 
            WHEN p_payload ? 'paid_by' 
            THEN (p_payload->>'paid_by')::UUID 
            ELSE paid_by 
        END,
        merchant = CASE 
            WHEN p_payload ? 'merchant' 
            THEN p_payload->>'merchant' 
            ELSE merchant 
        END,
        payment_method = CASE 
            WHEN p_payload ? 'payment_method' AND (p_payload->>'payment_method') IS NOT NULL 
            THEN p_payload->>'payment_method' 
            ELSE payment_method 
        END,
        account_id = CASE 
            WHEN p_payload ? 'account_id' 
            THEN (p_payload->>'account_id')::UUID 
            ELSE account_id 
        END,
        note = CASE 
            WHEN p_payload ? 'note' 
            THEN p_payload->>'note' 
            ELSE note 
        END,
        image_url = CASE 
            WHEN p_payload ? 'image_url' 
            THEN p_payload->>'image_url' 
            ELSE image_url 
        END,
        is_settled = CASE 
            WHEN p_payload ? 'is_settled' AND (p_payload->>'is_settled') IS NOT NULL 
            THEN (p_payload->>'is_settled')::BOOLEAN 
            ELSE is_settled 
        END,
        is_reconciled = CASE 
            WHEN p_payload ? 'is_reconciled' AND (p_payload->>'is_reconciled') IS NOT NULL 
            THEN (p_payload->>'is_reconciled')::BOOLEAN 
            ELSE is_reconciled 
        END,
        completed_by = CASE 
            WHEN p_payload ? 'completed_by' 
            THEN (p_payload->>'completed_by')::UUID 
            ELSE completed_by 
        END,
        completed_at = CASE 
            WHEN p_payload ? 'completed_at' 
            THEN (p_payload->>'completed_at')::TIMESTAMPTZ 
            ELSE completed_at 
        END,
        completion_note = CASE 
            WHEN p_payload ? 'completion_note' 
            THEN p_payload->>'completion_note' 
            ELSE completion_note 
        END,
        reminder_date = CASE 
            WHEN p_payload ? 'reminder_date' 
            THEN p_payload->>'reminder_date' 
            ELSE reminder_date 
        END,
        reminder_target = CASE 
            WHEN p_payload ? 'reminder_target' 
            THEN p_payload->>'reminder_target' 
            ELSE reminder_target 
        END,
        linked_transaction_id = CASE 
            WHEN p_payload ? 'linked_transaction_id' 
            THEN (p_payload->>'linked_transaction_id')::UUID 
            ELSE linked_transaction_id 
        END,
        transacted_at = CASE 
            WHEN p_payload ? 'transacted_at' AND (p_payload->>'transacted_at') IS NOT NULL 
            THEN (p_payload->>'transacted_at')::TIMESTAMPTZ 
            ELSE transacted_at 
        END,
        updated_at = NOW()
    WHERE id = p_tx_id;

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

-- 4. 安全批量新增交易 (例如全家零用錢批量發放)
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
            transacted_at,
            created_at,
            updated_at
        ) VALUES (
            COALESCE((item->>'id')::UUID, uuid_generate_v4()),
            (item->>'ledger_id')::UUID,
            (item->>'creator_id')::UUID,
            (item->>'category_id')::UUID,
            COALESCE((item->>'amount')::NUMERIC, 0),
            COALESCE(item->>'type', 'expense'),
            (item->>'paid_by')::UUID,
            item->>'merchant',
            COALESCE(item->>'payment_method', 'cash'),
            (item->>'account_id')::UUID,
            item->>'note',
            item->>'image_url',
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

-- 5. 安全更新或刪除記帳分類
CREATE OR REPLACE FUNCTION public.secure_update_category(
    p_cat_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    UPDATE public.categories
    SET
        name = CASE WHEN p_payload ? 'name' THEN p_payload->>'name' ELSE name END,
        icon = CASE WHEN p_payload ? 'icon' THEN p_payload->>'icon' ELSE icon END,
        color = CASE WHEN p_payload ? 'color' THEN p_payload->>'color' ELSE color END,
        type = CASE WHEN p_payload ? 'type' THEN p_payload->>'type' ELSE type END
    WHERE id = p_cat_id;

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

-- 6. 安全更新與刪除週期扣款規則
CREATE OR REPLACE FUNCTION public.secure_update_recurring_rule(
    p_rule_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    UPDATE public.recurring_rules
    SET
        name = CASE WHEN p_payload ? 'name' THEN p_payload->>'name' ELSE name END,
        amount = CASE WHEN p_payload ? 'amount' THEN (p_payload->>'amount')::NUMERIC ELSE amount END,
        type = CASE WHEN p_payload ? 'type' THEN p_payload->>'type' ELSE type END,
        category_id = CASE WHEN p_payload ? 'category_id' THEN (p_payload->>'category_id')::UUID ELSE category_id END,
        paid_by = CASE WHEN p_payload ? 'paid_by' THEN (p_payload->>'paid_by')::UUID ELSE paid_by END,
        payment_method = CASE WHEN p_payload ? 'payment_method' THEN p_payload->>'payment_method' ELSE payment_method END,
        account_id = CASE WHEN p_payload ? 'account_id' THEN (p_payload->>'account_id')::UUID ELSE account_id END,
        frequency = CASE WHEN p_payload ? 'frequency' THEN p_payload->>'frequency' ELSE frequency END,
        day_of_month = CASE WHEN p_payload ? 'day_of_month' THEN (p_payload->>'day_of_month')::INT ELSE day_of_month END,
        is_active = CASE WHEN p_payload ? 'is_active' THEN (p_payload->>'is_active')::BOOLEAN ELSE is_active END,
        last_recorded_period = CASE WHEN p_payload ? 'last_recorded_period' THEN p_payload->>'last_recorded_period' ELSE last_recorded_period END,
        current_installment = CASE WHEN p_payload ? 'current_installment' THEN (p_payload->>'current_installment')::INT ELSE current_installment END,
        updated_at = NOW()
    WHERE id = p_rule_id;

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

