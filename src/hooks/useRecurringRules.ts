import React, { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecurringRule, Ledger, Category, Profile, PaymentAccount } from '../types/database';
import {
  getBillPeriodLabel,
  appendPeriodKey,
  getInstallmentInfo,
  getCurrentPeriodKey,
  DEFAULT_RECURRING_PRESETS,
} from '../lib/recurring';
import { generateUUID } from '../lib/uuid';
import { safeAlert } from '../lib/ledgerUtils';
import { STORAGE_KEYS, DEMO_LEDGER_ID, DEMO_RECURRING_RULES } from '../constants/ledgerDefaults';

export interface UseRecurringRulesProps {
  currentLedger: Ledger;
  currentUser: Profile;
  categories: Category[];
  paymentAccounts: PaymentAccount[];
  addTransaction: (data: any) => Promise<string>;
  isConfigured: boolean;
  supabase: any;
}

export function useRecurringRules({
  currentLedger,
  currentUser,
  categories,
  paymentAccounts,
  addTransaction,
  isConfigured,
  supabase,
}: UseRecurringRulesProps) {
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>(DEMO_RECURRING_RULES);

  const saveRecurringRulesToStorage = useCallback(async (rules: RecurringRule[], targetLedgerId?: string) => {
    try {
      const ledgerId = targetLedgerId || currentLedger?.id;
      if (ledgerId) {
        const scopedRules = rules.map(r => ({ ...r, ledger_id: ledgerId }));
        await AsyncStorage.setItem(`${STORAGE_KEYS.RECURRING_RULES}_${ledgerId}`, JSON.stringify(scopedRules));
      }
    } catch (e) {
      console.warn('儲存週期扣款規則快取失敗:', e);
    }
  }, [currentLedger?.id]);

  // 新增自訂週期扣款規則
  const addRecurringRule = useCallback(async (
    ruleData: Omit<RecurringRule, 'id' | 'ledger_id' | 'created_at' | 'updated_at'>
  ): Promise<RecurringRule> => {
    const newRule: RecurringRule = {
      ...ruleData,
      id: generateUUID(),
      ledger_id: currentLedger.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const currentScoped = recurringRules.filter(r => r.ledger_id === currentLedger.id);
    const updated = [newRule, ...currentScoped];
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').insert(newRule);
      } catch (err) {
        console.warn('雲端新增週期規則失敗 (本地可用):', err);
      }
    }
    return newRule;
  }, [currentLedger.id, recurringRules, saveRecurringRulesToStorage, isConfigured, supabase]);

  // 更新週期扣款規則
  const updateRecurringRule = useCallback(async (
    id: string,
    data: Partial<Omit<RecurringRule, 'id' | 'ledger_id'>>
  ): Promise<boolean> => {
    const updated = recurringRules.map(r => {
      if (r.id === id) {
        return {
          ...r,
          ...data,
          ledger_id: currentLedger.id,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          ...data,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
      } catch (err) {
        console.warn('雲端更新週期規則失敗 (本地可用):', err);
      }
    }
    return true;
  }, [recurringRules, currentLedger.id, saveRecurringRulesToStorage, isConfigured, supabase]);

  // 刪除週期扣款規則
  const deleteRecurringRule = useCallback(async (id: string): Promise<boolean> => {
    const updated = recurringRules.filter(r => r.id !== id);
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').delete().eq('id', id);
      } catch (err) {
        console.warn('雲端刪除週期規則失敗 (本地可用):', err);
      }
    }
    return true;
  }, [recurringRules, currentLedger.id, saveRecurringRulesToStorage, isConfigured, supabase]);

  // 確認記帳
  const recordRecurringBill = useCallback(async (
    ruleId: string,
    customAmount?: number,
    transactedAt?: string,
    note?: string,
    targetPeriodDate?: Date
  ): Promise<boolean> => {
    const rule = recurringRules.find(r => r.id === ruleId);
    if (!rule) return false;

    const finalAmount = customAmount !== undefined && customAmount > 0 ? customAmount : rule.default_amount;
    if (!finalAmount || finalAmount <= 0) {
      safeAlert('金額錯誤', '請填寫大於 0 的正確金額');
      return false;
    }

    const txDate = transactedAt || new Date().toISOString();
    const periodRefDate = targetPeriodDate || new Date(txDate);
    const periodLabel = getBillPeriodLabel(rule, periodRefDate);
    const autoNote = note !== undefined && note.trim() !== ''
      ? note.trim()
      : `[${rule.name}] ${periodLabel}`;

    await addTransaction({
      amount: finalAmount,
      type: 'expense',
      category_id: rule.category_id,
      paid_by: rule.paid_by || currentUser.id,
      merchant: rule.merchant || rule.name,
      payment_method: rule.payment_method,
      account_id: rule.account_id,
      transacted_at: txDate,
      note: autoNote,
      linked_transaction_id: `rec_${rule.id}`,
    });

    const targetPeriod = getCurrentPeriodKey(rule, periodRefDate);
    let nextCurrentInstallment = rule.current_installment;
    let nextIsActive = rule.is_active;
    let isFullyCompleted = false;

    if (rule.is_installment && rule.total_installments && rule.total_installments > 0) {
      const instInfo = getInstallmentInfo(rule, periodRefDate);
      const currentNumber = instInfo ? instInfo.currentInstallmentNumber : (rule.current_installment || 1);
      nextCurrentInstallment = currentNumber + 1;
      if (nextCurrentInstallment > rule.total_installments) {
        nextIsActive = false;
        isFullyCompleted = true;
      }
    }

    const nextPeriodStr = appendPeriodKey(rule.last_recorded_period, targetPeriod);

    const updated = recurringRules.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        }).eq('id', ruleId);
      } catch {}
    }

    if (isFullyCompleted) {
      safeAlert(
        '🎉 分期付款已全額繳清！',
        `恭喜！「${rule.name}」共 ${rule.total_installments} 期已全數入帳結清，系統已自動將此規則完結除役，感謝您的細心記帳！`
      );
    }

    return true;
  }, [recurringRules, currentUser.id, addTransaction, saveRecurringRulesToStorage, currentLedger.id, isConfigured, supabase]);

  // 略過本期帳單
  const skipRecurringBill = useCallback(async (ruleId: string, periodKey?: string): Promise<boolean> => {
    const rule = recurringRules.find(r => r.id === ruleId);
    if (!rule) return false;

    const targetPeriod = periodKey || getCurrentPeriodKey(rule, new Date());
    let nextCurrentInstallment = rule.current_installment;
    let nextIsActive = rule.is_active;

    if (rule.is_installment && rule.total_installments && rule.total_installments > 0) {
      const instInfo = getInstallmentInfo(rule, new Date());
      const currentNumber = instInfo ? instInfo.currentInstallmentNumber : (rule.current_installment || 1);
      nextCurrentInstallment = currentNumber + 1;
      if (nextCurrentInstallment > rule.total_installments) {
        nextIsActive = false;
      }
    }

    const nextPeriodStr = appendPeriodKey(rule.last_recorded_period, targetPeriod);

    const updated = recurringRules.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        }).eq('id', ruleId);
      } catch {}
    }
    return true;
  }, [recurringRules, saveRecurringRulesToStorage, currentLedger.id, isConfigured, supabase]);

  // 恢復預設週期規則
  const restoreDefaultRecurringRules = useCallback(async (): Promise<void> => {
    const utilityCategory = categories.find(c => c.name.includes('水電') || c.name.includes('居家')) || categories[0];
    const defaultCard = paymentAccounts.find(a => a.type === 'credit_card');
    const defaultRules: RecurringRule[] = DEFAULT_RECURRING_PRESETS.map((preset) => ({
      id: generateUUID(),
      ledger_id: currentLedger.id,
      name: preset.name,
      amount_type: preset.amount_type,
      default_amount: preset.default_amount,
      category_id: utilityCategory?.id || '',
      merchant: preset.merchant,
      paid_by: currentUser.id,
      payment_method: preset.payment_method,
      account_id: preset.payment_method === 'credit_card' ? defaultCard?.id : undefined,
      frequency: preset.frequency,
      due_day: preset.due_day,
      bimonthly_start_month: (preset as any).bimonthly_start_month,
      is_active: true,
      last_recorded_period: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    setRecurringRules(defaultRules);
    await saveRecurringRulesToStorage(defaultRules, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').insert(defaultRules);
      } catch {}
    }
  }, [categories, paymentAccounts, currentLedger.id, currentUser.id, saveRecurringRulesToStorage, isConfigured, supabase]);

  return {
    recurringRules,
    setRecurringRules,
    saveRecurringRulesToStorage,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recordRecurringBill,
    skipRecurringBill,
    restoreDefaultRecurringRules,
  };
}

