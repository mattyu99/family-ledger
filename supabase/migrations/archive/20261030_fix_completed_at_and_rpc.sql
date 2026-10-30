-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：緊急修復：補齊 completed_at 欄位與修正 RPC 語法
-- 目的：解決修改交易時因缺少 completed_at 欄位或空字串 UUID 導致 RPC 報錯之問題
-- 日期：2026-10-30
-- ==============================================================================

-- 1. 補齊 transactions 表之 completed_at 辦妥時間戳記欄位
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. 安全更新交易明細 (純 PL/pgSQL 流程控制，徹底杜絕 CASE WHEN 語法混淆)
CREATE OR REPLACE FUNCTION public.secure_update_transaction(
    p_tx_id UUID,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    -- 若交易不存在則直接返回
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN
        RETURN jsonb_build_object('success', true, 'rows_affected', 0, 'id', p_tx_id);
    END IF;

    -- 針對各欄位進行純淨個別更新
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

    -- 最後統整更新 updated_at 並獲取受影響筆數
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

-- 3. 安全更新週期規則 (純 PL/pgSQL 流程控制，徹底杜絕 CASE WHEN 語法混淆)
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
