import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LedgerBudget, Profile, Transaction, Category } from '../types/database';
import { STORAGE_KEYS } from '../constants/ledgerDefaults';
import { supabaseAdmin } from '../lib/supabase';

export interface UseLedgerBudgetProps {
  ledgerId?: string;
  members: Profile[];
  currentUser?: Profile;
  isOwner: boolean;
  transactions: Transaction[];
  getCategoryById: (id?: string) => Category;
  getMemberById: (id?: string) => Profile | undefined;
  isConfigured: boolean;
  supabase: any;
}

export function useLedgerBudget({
  ledgerId,
  members,
  currentUser,
  isOwner,
  transactions,
  getCategoryById,
  getMemberById,
  isConfigured,
  supabase,
}: UseLedgerBudgetProps) {
  const [currentBudget, setCurrentBudget] = useState<LedgerBudget | null>(null);
  const [isBudgetWidgetVisibleOnDevice, setIsBudgetWidgetVisibleOnDeviceState] = useState<boolean>(true);
  const loadBudgetRef = useRef<((id: string) => Promise<void>) | null>(null);

  const loadBudget = useCallback(async (targetLedgerId: string) => {
    if (!targetLedgerId) return;
    try {
      // 1. 載入本機顯隱偏好
      try {
        const visKey = `@family_ledger_budget_visible_${targetLedgerId}`;
        const savedVis = await AsyncStorage.getItem(visKey);
        if (savedVis !== null) {
          setIsBudgetWidgetVisibleOnDeviceState(savedVis === 'true');
        } else {
          setIsBudgetWidgetVisibleOnDeviceState(true);
        }
      } catch {}

      // 2. 載入預算資料
      const key = `${STORAGE_KEYS.BUDGET}_${targetLedgerId}`;
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        try {
          setCurrentBudget(JSON.parse(cached));
        } catch {
          // ignore parse error
        }
      } else {
        setCurrentBudget({
          ledger_id: targetLedgerId,
          is_enabled: false,
          monthly_total: 40000,
          alert_threshold: 80,
          category_budgets: {},
          member_budgets: {},
        });
      }

      // 嘗試同步雲端 (若 Supabase 有 ledger_budgets 表)
      if (isConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('ledger_budgets')
            .select('*')
            .eq('ledger_id', targetLedgerId)
            .maybeSingle();
          if (!error && data) {
            const cloudBudget: LedgerBudget = {
              id: data.id,
              ledger_id: data.ledger_id,
              is_enabled: data.is_enabled ?? true,
              monthly_total: Number(data.monthly_total) || 40000,
              alert_threshold: Number(data.alert_threshold) || 80,
              category_budgets: data.category_budgets || {},
              member_budgets: data.member_budgets || {},
              updated_at: data.updated_at,
            };
            setCurrentBudget(cloudBudget);
            await AsyncStorage.setItem(key, JSON.stringify(cloudBudget));
          }
        } catch {
          // 資料表可能尚未建立，自動降級維持本機運作
        }
      }
    } catch (err) {
      console.warn('載入預算快取失敗:', err);
    }
  }, [isConfigured, supabase]);

  loadBudgetRef.current = loadBudget;

  useEffect(() => {
    if (ledgerId) {
      loadBudget(ledgerId);
    }
  }, [ledgerId, loadBudget]);

  const setBudgetWidgetVisibleOnDevice = useCallback(async (visible: boolean) => {
    setIsBudgetWidgetVisibleOnDeviceState(visible);
    if (!ledgerId) return;
    try {
      const visKey = `@family_ledger_budget_visible_${ledgerId}`;
      await AsyncStorage.setItem(visKey, visible ? 'true' : 'false');
    } catch {}
  }, [ledgerId]);

  const updateBudget = useCallback(async (newBudgetData: Partial<LedgerBudget>) => {
    if (!ledgerId) return;

    // 權限防護：家庭公帳總預算僅管理員可異動
    const allowedEnabled = isOwner
      ? (newBudgetData.is_enabled !== undefined ? newBudgetData.is_enabled : (currentBudget?.is_enabled ?? true))
      : (currentBudget?.is_enabled ?? true);
    const allowedMonthlyTotal = isOwner
      ? (newBudgetData.monthly_total !== undefined ? newBudgetData.monthly_total : (currentBudget?.monthly_total ?? 40000))
      : (currentBudget?.monthly_total ?? 40000);
    const allowedThreshold = isOwner
      ? (newBudgetData.alert_threshold !== undefined ? newBudgetData.alert_threshold : (currentBudget?.alert_threshold ?? 80))
      : (currentBudget?.alert_threshold ?? 80);
    const allowedCategoryBudgets = isOwner
      ? (newBudgetData.category_budgets !== undefined ? newBudgetData.category_budgets : (currentBudget?.category_budgets ?? {}))
      : (currentBudget?.category_budgets ?? {});

    // 成員額度防護：本機成員可自訂修改自己的個人額度，帳本管理員亦可協助配置調整所有成員額度
    const mergedMemberBudgets: Record<string, number> = { ...(currentBudget?.member_budgets ?? {}) };
    if (newBudgetData.member_budgets) {
      members.forEach(m => {
        const isMyMember =
          m.id === currentUser?.id ||
          (!!currentUser?.display_name && m.display_name?.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase());

        const canManageThisMember = isOwner || isMyMember;

        if (canManageThisMember) {
          const newAmt = newBudgetData.member_budgets?.[m.id];
          if (newAmt !== undefined && newAmt > 0) {
            mergedMemberBudgets[m.id] = newAmt;
          } else {
            delete mergedMemberBudgets[m.id];
          }
        }
      });
    }

    const merged: LedgerBudget = {
      ledger_id: ledgerId,
      is_enabled: allowedEnabled,
      monthly_total: allowedMonthlyTotal,
      alert_threshold: allowedThreshold,
      category_budgets: allowedCategoryBudgets,
      member_budgets: mergedMemberBudgets,
      updated_at: new Date().toISOString(),
    };

    setCurrentBudget(merged);
    try {
      await AsyncStorage.setItem(`${STORAGE_KEYS.BUDGET}_${ledgerId}`, JSON.stringify(merged));
    } catch (err) {
      console.warn('儲存本機預算失敗:', err);
    }

    if (isConfigured && supabase) {
      try {
        const budgetPayload = {
          ledger_id: ledgerId,
          is_enabled: merged.is_enabled,
          monthly_total: merged.monthly_total,
          alert_threshold: merged.alert_threshold,
          category_budgets: merged.category_budgets,
          member_budgets: merged.member_budgets,
          updated_at: merged.updated_at,
        };
        const { error } = await supabase.from('ledger_budgets').upsert(budgetPayload, { onConflict: 'ledger_id' });
        if (error) {
          await supabaseAdmin.from('ledger_budgets').upsert(budgetPayload, { onConflict: 'ledger_id' });
        }
      } catch {
        // 若雲端尚未建表則維持本機運作
      }
    }
  }, [ledgerId, currentBudget, isOwner, members, currentUser, isConfigured, supabase]);

  const getBudgetProgress = useCallback((targetMonthYm?: string, targetMemberId?: string) => {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ym = targetMonthYm || currentYm;
    const isEnabled = currentBudget?.is_enabled ?? false;
    const alertThreshold = currentBudget?.alert_threshold || 80;

    const isMemberPerspective = Boolean(targetMemberId && targetMemberId !== 'all');
    let targetMemberName: string | undefined = undefined;
    let totalBudget = 0;
    let hasMemberBudgetConfigured = false;

    if (isMemberPerspective && targetMemberId) {
      const m = members.find(mem => mem.id === targetMemberId) || getMemberById(targetMemberId);
      targetMemberName = m?.display_name || '成員';
      const memBudget = currentBudget?.member_budgets?.[targetMemberId];
      if (memBudget !== undefined && memBudget > 0) {
        totalBudget = memBudget;
        hasMemberBudgetConfigured = true;
      } else {
        totalBudget = 0;
        hasMemberBudgetConfigured = false;
      }
    } else {
      totalBudget = currentBudget?.monthly_total || 0;
    }

    const monthTransactions = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const tYm = t.transacted_at ? t.transacted_at.slice(0, 7) : '';
      if (tYm !== ym) return false;
      if (isMemberPerspective && targetMemberId) {
        return t.paid_by === targetMemberId;
      }
      return true;
    });

    const spentAmount = monthTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const remainingAmount = Math.max(0, totalBudget - spentAmount);
    const spentRatio = totalBudget > 0 ? (spentAmount / totalBudget) * 100 : 0;
    const isOverBudget = isEnabled && totalBudget > 0 && spentAmount > totalBudget;
    const isWarning = isEnabled && totalBudget > 0 && spentRatio >= alertThreshold && !isOverBudget;

    const [yearStr, monthStr] = ym.split('-');
    const y = parseInt(yearStr, 10) || now.getFullYear();
    const m = parseInt(monthStr, 10) || (now.getMonth() + 1);
    const totalDaysInMonth = new Date(y, m, 0).getDate();
    const isCurrentMonth = ym === currentYm;
    const currentDay = isCurrentMonth ? now.getDate() : 1;
    const daysRemaining = Math.max(1, totalDaysInMonth - currentDay + 1);
    const dailyAvailable = remainingAmount > 0 ? Math.round(remainingAmount / daysRemaining) : 0;

    return {
      isEnabled,
      totalBudget,
      spentAmount,
      remainingAmount,
      spentRatio: Math.min(100, Math.round(spentRatio * 10) / 10),
      rawSpentRatio: Math.round(spentRatio * 10) / 10,
      isOverBudget,
      isWarning,
      alertThreshold,
      dailyAvailable,
      daysRemaining,
      monthYm: ym,
      isMemberPerspective,
      targetMemberId,
      targetMemberName,
      hasMemberBudgetConfigured,
    };
  }, [currentBudget, transactions, members, getMemberById]);

  const getMoMComparison = useCallback((targetMonthYm?: string) => {
    const now = new Date();
    const currentYm = targetMonthYm || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [yearStr, monthStr] = currentYm.split('-');
    let y = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const prevYm = `${y}-${String(m).padStart(2, '0')}`;

    let currentExpense = 0;
    let currentIncome = 0;
    let prevExpense = 0;
    let prevIncome = 0;

    const currentCatExpense: Record<string, number> = {};
    const prevCatExpense: Record<string, number> = {};

    transactions.forEach(t => {
      const tYm = t.transacted_at ? t.transacted_at.slice(0, 7) : '';
      const amt = Number(t.amount) || 0;
      if (tYm === currentYm) {
        if (t.type === 'expense') {
          currentExpense += amt;
          currentCatExpense[t.category_id] = (currentCatExpense[t.category_id] || 0) + amt;
        } else if (t.type === 'income') {
          currentIncome += amt;
        }
      } else if (tYm === prevYm) {
        if (t.type === 'expense') {
          prevExpense += amt;
          prevCatExpense[t.category_id] = (prevCatExpense[t.category_id] || 0) + amt;
        } else if (t.type === 'income') {
          prevIncome += amt;
        }
      }
    });

    const expenseDiff = currentExpense - prevExpense;
    const expenseDiffRate = prevExpense > 0 ? Math.round(((expenseDiff) / prevExpense) * 1000) / 10 : 0;

    const incomeDiff = currentIncome - prevIncome;
    const incomeDiffRate = prevIncome > 0 ? Math.round(((incomeDiff) / prevIncome) * 1000) / 10 : 0;

    const allCatIds = Array.from(new Set([...Object.keys(currentCatExpense), ...Object.keys(prevCatExpense)]));
    let topIncreaseCat: { name: string; icon: string; diff: number } | undefined;
    let topDecreaseCat: { name: string; icon: string; diff: number } | undefined;

    let maxIncDiff = 0;
    let maxDecDiff = 0;

    allCatIds.forEach(catId => {
      const cAmt = currentCatExpense[catId] || 0;
      const pAmt = prevCatExpense[catId] || 0;
      const diff = cAmt - pAmt;
      const cat = getCategoryById(catId);
      if (diff > maxIncDiff && diff > 0) {
        maxIncDiff = diff;
        topIncreaseCat = { name: cat.name, icon: cat.icon, diff };
      }
      if (diff < maxDecDiff && diff < 0) {
        maxDecDiff = diff;
        topDecreaseCat = { name: cat.name, icon: cat.icon, diff: Math.abs(diff) };
      }
    });

    return {
      currentYm,
      prevYm,
      currentExpense,
      prevExpense,
      expenseDiff,
      expenseDiffRate,
      currentIncome,
      prevIncome,
      incomeDiff,
      incomeDiffRate,
      topIncreasedCategory: topIncreaseCat,
      topDecreasedCategory: topDecreaseCat,
    };
  }, [transactions, getCategoryById]);

  const getSixMonthTrend = useCallback(() => {
    const now = new Date();
    const months: Array<{ ym: string; label: string; income: number; expense: number; balance: number }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getMonth() + 1}月`;
      months.push({ ym, label, income: 0, expense: 0, balance: 0 });
    }

    const monthMap = new Map<string, { income: number; expense: number }>();
    months.forEach(m => monthMap.set(m.ym, { income: 0, expense: 0 }));

    transactions.forEach(t => {
      const tYm = t.transacted_at ? t.transacted_at.slice(0, 7) : '';
      const entry = monthMap.get(tYm);
      if (entry) {
        const amt = Number(t.amount) || 0;
        if (t.type === 'expense') {
          entry.expense += amt;
        } else if (t.type === 'income') {
          entry.income += amt;
        }
      }
    });

    return months.map(m => {
      const entry = monthMap.get(m.ym) || { income: 0, expense: 0 };
      return {
        ym: m.ym,
        label: m.label,
        income: entry.income,
        expense: entry.expense,
        balance: entry.income - entry.expense,
      };
    });
  }, [transactions]);

  return {
    currentBudget,
    setCurrentBudget,
    isBudgetWidgetVisibleOnDevice,
    loadBudget,
    setBudgetWidgetVisibleOnDevice,
    updateBudget,
    getBudgetProgress,
    getMoMComparison,
    getSixMonthTrend,
  };
}

