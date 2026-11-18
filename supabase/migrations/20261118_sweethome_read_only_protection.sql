-- ==============================================================================
-- 專案：家庭記帳本 (Family Ledger)
-- 模組：SWEETHOME 示範母本雲端唯讀加固防護 (Demo Ledger Read-Only Protection)
-- 目的：嚴格保護官方示範帳本 (SWEETHOME) 之母本交易、帳戶與分類，防止訪客誤刪或篡改
-- 日期：2026-11-18
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 示範帳本母本刪除防護：嚴禁任何一般訪客刪除示範母本交易
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can delete transactions" ON public.transactions;
CREATE POLICY "Members can delete transactions" ON public.transactions FOR DELETE 
  USING (
    ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
    AND public.is_ledger_member(ledger_id)
  );

-- ------------------------------------------------------------------------------
-- 2. 示範帳本母本修改防護：僅允許留言交流板更新互動內容，其餘母本消費一律鎖定
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can update transactions" ON public.transactions;
CREATE POLICY "Members can update transactions" ON public.transactions FOR UPDATE 
  USING (
    (
      -- 非示範帳本：正常依成員身分維護
      ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
      AND public.is_ledger_member(ledger_id)
    )
    OR
    (
      -- 官方示範帳本：僅允許迎賓交流板留言互動，其餘母本記帳全鎖定唯讀
      ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid 
      AND (id = 'ee400000-0000-4000-8000-000000000037'::uuid OR note LIKE '%#訪客留言%')
    )
  );

-- ------------------------------------------------------------------------------
-- 3. 示範帳本新增交易防護：防止訪客隨意試玩記帳污染雲端示範母本
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
CREATE POLICY "Members can insert transactions" ON public.transactions FOR INSERT 
  WITH CHECK (
    (
      -- 非示範帳本：正常依成員身分新增
      ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
      AND public.is_ledger_member(ledger_id)
    )
    OR
    (
      -- 官方示範帳本：僅允許公開留言板互動，日常隨意記帳僅在訪客本機試玩沙盒
      ledger_id = 'ee100000-0000-4000-8000-000000000001'::uuid 
      AND type = 'memo'
      AND note LIKE '%#訪客留言%'
    )
  );

-- ------------------------------------------------------------------------------
-- 4. 示範帳本帳戶、分類、週期規則母本防護：只讀放行，嚴禁刪改
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can manage payment accounts" ON public.payment_accounts;
CREATE POLICY "Members can manage payment accounts" ON public.payment_accounts FOR ALL 
  USING (
    ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
    AND public.is_ledger_member(ledger_id)
  );

DROP POLICY IF EXISTS "成員可刪除所屬帳本的付款方式" ON public.payment_methods;
CREATE POLICY "成員可刪除所屬帳本的付款方式" ON public.payment_methods FOR DELETE 
  USING (
    ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
    AND public.is_ledger_member(ledger_id)
  );

DROP POLICY IF EXISTS "成員可刪除所屬帳本的週期規則" ON public.recurring_rules;
CREATE POLICY "成員可刪除所屬帳本的週期規則" ON public.recurring_rules FOR DELETE 
  USING (
    ledger_id <> 'ee100000-0000-4000-8000-000000000001'::uuid 
    AND public.is_ledger_member(ledger_id)
  );
