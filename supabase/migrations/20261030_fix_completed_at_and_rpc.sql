-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：緊急修復：補齊 completed_at 欄位與修正 RPC 語法
-- 目的：解決修改交易時因缺少 completed_at 欄位導致 RPC 報錯並卡在離線隊列之問題
-- 日期：2026-10-30
-- ==============================================================================

-- 1. 補齊 transactions 表之 completed_at 辦妥時間戳記欄位
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. 安全更新交易明細 (重新整理函式確保綁定 completed_at)
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

-- 3. 安全更新週期規則 (修正 default_amount 與 due_day 等欄位對齊)
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
        default_amount = CASE 
            WHEN p_payload ? 'default_amount' THEN (p_payload->>'default_amount')::NUMERIC 
            WHEN p_payload ? 'amount' THEN (p_payload->>'amount')::NUMERIC 
            ELSE default_amount 
        END,
        amount_type = CASE 
            WHEN p_payload ? 'amount_type' THEN p_payload->>'amount_type' 
            WHEN p_payload ? 'type' THEN p_payload->>'type' 
            ELSE amount_type 
        END,
        category_id = CASE WHEN p_payload ? 'category_id' THEN (p_payload->>'category_id')::UUID ELSE category_id END,
        merchant = CASE WHEN p_payload ? 'merchant' THEN p_payload->>'merchant' ELSE merchant END,
        paid_by = CASE WHEN p_payload ? 'paid_by' THEN (p_payload->>'paid_by')::UUID ELSE paid_by END,
        payment_method = CASE WHEN p_payload ? 'payment_method' THEN p_payload->>'payment_method' ELSE payment_method END,
        account_id = CASE WHEN p_payload ? 'account_id' THEN (p_payload->>'account_id')::UUID ELSE account_id END,
        frequency = CASE WHEN p_payload ? 'frequency' THEN p_payload->>'frequency' ELSE frequency END,
        due_day = CASE 
            WHEN p_payload ? 'due_day' THEN (p_payload->>'due_day')::INT 
            WHEN p_payload ? 'day_of_month' THEN (p_payload->>'day_of_month')::INT 
            ELSE due_day 
        END,
        bimonthly_start_month = CASE WHEN p_payload ? 'bimonthly_start_month' THEN (p_payload->>'bimonthly_start_month')::INT ELSE bimonthly_start_month END,
        is_active = CASE WHEN p_payload ? 'is_active' THEN (p_payload->>'is_active')::BOOLEAN ELSE is_active END,
        last_recorded_period = CASE WHEN p_payload ? 'last_recorded_period' THEN p_payload->>'last_recorded_period' ELSE last_recorded_period END,
        is_installment = CASE WHEN p_payload ? 'is_installment' THEN (p_payload->>'is_installment')::BOOLEAN ELSE is_installment END,
        total_installments = CASE WHEN p_payload ? 'total_installments' THEN (p_payload->>'total_installments')::INT ELSE total_installments END,
        current_installment = CASE WHEN p_payload ? 'current_installment' THEN (p_payload->>'current_installment')::INT ELSE current_installment END,
        installment_start_period = CASE WHEN p_payload ? 'installment_start_period' THEN p_payload->>'installment_start_period' ELSE installment_start_period END,
        note = CASE WHEN p_payload ? 'note' THEN p_payload->>'note' ELSE note END,
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

-- 4. 安全刪除交易明細 (防外鍵約束異常)
CREATE OR REPLACE FUNCTION public.secure_delete_transaction(
    p_tx_id UUID,
    p_ledger_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    -- 4.1 刪除分帳明細
    DELETE FROM public.transaction_splits WHERE transaction_id = p_tx_id;

    -- 4.2 寫入墓碑表以防舊裝置復活 (僅在 ledger 存在時記錄)
    IF p_ledger_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ledgers WHERE id = p_ledger_id) THEN
        INSERT INTO public.deleted_transactions (id, ledger_id)
        VALUES (p_tx_id, p_ledger_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 4.3 刪除主交易記錄
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
